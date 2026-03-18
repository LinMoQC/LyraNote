"""
Retrieval Agent: hybrid search (pgvector cosine + PostgreSQL FTS) → Top-K chunks.

Supports two search modes:
- Notebook-scoped: only chunks belonging to a specific notebook (notebook chat)
- Global: all chunks across all notebooks owned by the user (global chat)

Hybrid search weights: vector 0.7 + BM25/FTS 0.3 (configurable).
Falls back to vector-only if FTS index is not yet available.
"""

from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Chunk, Notebook, Source


TOP_K = 5
SIMILARITY_THRESHOLD = 0.3
HYBRID_VECTOR_WEIGHT = 0.7
HYBRID_TEXT_WEIGHT = 0.3


async def _vector_search(
    query_vec: list[float],
    notebook_id: str | None,
    db: AsyncSession,
    top_k: int,
    global_search: bool,
    user_id: UUID | None,
) -> list[dict]:
    """Inner vector-only search, returns list of {chunk_id, score, ...}."""
    from sqlalchemy.orm import aliased
    candidate_k = min(200, top_k * 4)

    base = (
        select(
            Chunk.id,
            Chunk.content,
            Chunk.source_id,
            Chunk.notebook_id,
            Chunk.source_type,
            Chunk.metadata_,
            Source.title.label("source_title"),
            (1 - Chunk.embedding.cosine_distance(query_vec)).label("score"),
        )
        .outerjoin(Source, Chunk.source_id == Source.id)
        .where(
            # Include source-type chunks that are indexed OR note-type chunks
            ((Source.status == "indexed") | (Chunk.source_type == "note"))
        )
        .order_by(Chunk.embedding.cosine_distance(query_vec))
        .limit(candidate_k)
    )

    if global_search and user_id is not None:
        stmt = base.join(Notebook, Chunk.notebook_id == Notebook.id).where(
            Notebook.user_id == user_id
        )
    else:
        stmt = base.where(Chunk.notebook_id == UUID(notebook_id) if notebook_id else text("1=1"))

    result = await db.execute(stmt)
    return [
        {
            "chunk_id": str(row.id),
            "source_id": str(row.source_id) if row.source_id else "",
            "source_title": (
                row.source_title
                or (row.metadata_ or {}).get("note_title", "")
                or ("📝 笔记" if row.source_type == "note" else "未知来源")
            ),
            "excerpt": row.content[:300],
            "content": row.content,
            "vector_score": float(row.score),
        }
        for row in result.all()
    ]


async def _fts_search(
    query: str,
    notebook_id: str | None,
    db: AsyncSession,
    top_k: int,
    global_search: bool,
    user_id: UUID | None,
) -> list[dict]:
    """
    PostgreSQL FTS search using plainto_tsquery (handles Chinese via 'simple' config).
    Returns list of {chunk_id, fts_score}.
    Falls back to empty list if content_tsv column doesn't exist yet.
    """
    try:
        candidate_k = min(200, top_k * 4)
        tsquery = func.plainto_tsquery("simple", query)
        base = (
            select(
                Chunk.id,
                func.ts_rank(text("content_tsv"), tsquery).label("fts_rank"),
            )
            .outerjoin(Source, Chunk.source_id == Source.id)
            .where(
                ((Source.status == "indexed") | (Chunk.source_type == "note")),
                text("content_tsv @@ plainto_tsquery('simple', :q)").bindparams(q=query),
            )
            .order_by(text("fts_rank DESC"))
            .limit(candidate_k)
        )

        if global_search and user_id is not None:
            stmt = base.join(Notebook, Chunk.notebook_id == Notebook.id).where(
                Notebook.user_id == user_id
            )
        else:
            stmt = base.where(Chunk.notebook_id == UUID(notebook_id) if notebook_id else text("1=1"))

        result = await db.execute(stmt)
        rows = result.all()
        if not rows:
            return []
        max_rank = max(float(r.fts_rank) for r in rows) or 1.0
        return [
            {"chunk_id": str(r.id), "fts_score": float(r.fts_rank) / max_rank}
            for r in rows
        ]
    except Exception:
        return []


def _merge_hybrid(
    vector_results: list[dict],
    fts_results: list[dict],
    vector_weight: float = HYBRID_VECTOR_WEIGHT,
    text_weight: float = HYBRID_TEXT_WEIGHT,
) -> list[dict]:
    """
    Merge and normalise vector + FTS results using weighted reciprocal-rank fusion.
    Final score = vector_weight × vector_score + text_weight × fts_score.
    """
    fts_map: dict[str, float] = {r["chunk_id"]: r["fts_score"] for r in fts_results}

    merged: dict[str, dict] = {}
    for r in vector_results:
        cid = r["chunk_id"]
        fts_score = fts_map.get(cid, 0.0)
        final = vector_weight * r["vector_score"] + text_weight * fts_score
        merged[cid] = {**r, "score": final}

    # FTS-only results (not in vector set) — only add if fts_score high enough
    for r in fts_results:
        cid = r["chunk_id"]
        if cid not in merged:
            # These chunks didn't make the vector candidate cut, skip for now
            pass

    return sorted(merged.values(), key=lambda x: x["score"], reverse=True)


async def _rewrite_query(query: str) -> str:
    """Rewrite a conversational query into a retrieval-friendly keyword phrase.

    Inspired by LobeHub's query rewrite step that improves RAG recall by
    transforming colloquial questions into concise search terms.
    """
    from app.providers.llm import chat

    prompt = (
        "将以下用户问题改写为适合向量检索的简洁关键词短语。"
        "只输出改写结果，不要解释。如果问题已经足够简洁则原样返回。\n\n"
        f"用户问题：{query}"
    )
    try:
        result = await chat(
            [{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=100,
        )
        rewritten = result.strip()
        return rewritten if rewritten else query
    except Exception:
        return query


async def retrieve_chunks(
    query: str,
    notebook_id: str,
    db: AsyncSession,
    top_k: int = TOP_K,
    *,
    global_search: bool = False,
    user_id: UUID | None = None,
) -> list[dict]:
    """
    Hybrid search: query rewrite → vector (0.7) + FTS (0.3) → merged → Top-K.

    - global_search=False (default): restrict to chunks in `notebook_id`
    - global_search=True: search across ALL notebooks owned by `user_id`
    """
    from app.providers.embedding import embed_query

    rewritten_query = await _rewrite_query(query)
    query_vec = await embed_query(rewritten_query)

    # Run vector and FTS searches (use rewritten query for better recall)
    vector_results = await _vector_search(query_vec, notebook_id, db, top_k, global_search, user_id)
    fts_results = await _fts_search(rewritten_query, notebook_id, db, top_k, global_search, user_id)

    if fts_results:
        # Hybrid merge
        merged = _merge_hybrid(vector_results, fts_results)
    else:
        # FTS unavailable (index not yet created) — vector-only fallback
        merged = [{**r, "score": r["vector_score"]} for r in vector_results]

    return [
        {
            "chunk_id": r["chunk_id"],
            "source_id": r["source_id"],
            "source_title": r["source_title"],
            "excerpt": r["excerpt"],
            "content": r["content"],
            "score": r["score"],
        }
        for r in merged[:top_k]
        if r["score"] >= SIMILARITY_THRESHOLD
    ]
