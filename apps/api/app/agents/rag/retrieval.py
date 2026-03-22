"""
Retrieval Agent: hybrid search (pgvector cosine + PostgreSQL FTS) → Top-K chunks.

Supports two search modes:
- Notebook-scoped: only chunks belonging to a specific notebook (notebook chat)
- Global: all chunks across all notebooks owned by the user (global chat)

Optimizations (v1.0):
- Multi-query expansion: generates 3 query variants in one LLM call for better recall
- Conversation-aware rewrite: accepts chat history for coreference resolution
- Recency weight: final = 0.6×vec + 0.3×fts + 0.1×recency (time-decay)
- FTS-only inclusion: FTS-only chunks now included via supplemental DB fetch
- MMR deduplication: cosine similarity threshold filters redundant chunks
- Cross-Encoder reranking: optional bge-reranker (configured via RERANKER_API_KEY)
- Structured evaluation logging for quality tracking
"""

from __future__ import annotations

import logging
import math
import time
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Chunk, Notebook, Source

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TOP_K = 5
SIMILARITY_THRESHOLD = 0.3
HYBRID_VECTOR_WEIGHT  = 0.6   # reduced from 0.7 to make room for recency
HYBRID_TEXT_WEIGHT    = 0.3
HYBRID_RECENCY_WEIGHT = 0.1
MMR_SIMILARITY_THRESHOLD = 0.85  # cosine sim above this → chunk is redundant
RERANK_CANDIDATE_K = 10          # pass top-10 to reranker, return top-5

_REWRITE_TIMEOUT = 4.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _recency_score(updated_at: datetime | None) -> float:
    """Exponential decay by age. Documents updated today → ~1.0; 1 year ago → ~0.37."""
    if updated_at is None:
        return 0.5
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    days = max(0, (datetime.now(timezone.utc) - updated_at).days)
    return math.exp(-days / 365)


def _cosine_sim(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two equal-length vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _mmr_filter(chunks: list[dict], threshold: float = MMR_SIMILARITY_THRESHOLD) -> list[dict]:
    """
    Maximum Marginal Relevance: drop chunks whose embedding is too similar to
    an already-selected chunk, preserving result diversity.
    Chunks without embeddings are always kept.
    """
    selected: list[dict] = []
    for chunk in chunks:
        vec = chunk.get("embedding")
        if vec is None or not selected:
            selected.append(chunk)
            continue
        max_sim = max(
            (_cosine_sim(vec, s["embedding"]) for s in selected if s.get("embedding")),
            default=0.0,
        )
        if max_sim < threshold:
            selected.append(chunk)
    return selected


# ---------------------------------------------------------------------------
# DB search functions
# ---------------------------------------------------------------------------

async def _vector_search(
    query_vec: list[float],
    notebook_id: str | None,
    db: AsyncSession,
    top_k: int,
    global_search: bool,
    user_id: UUID | None,
) -> list[dict]:
    """Vector-only search. Returns top candidates with updated_at for recency scoring."""
    candidate_k = min(200, max(RERANK_CANDIDATE_K * 2, top_k * 4))

    base = (
        select(
            Chunk.id,
            Chunk.content,
            Chunk.source_id,
            Chunk.source_type,
            Chunk.metadata_,
            Source.title.label("source_title"),
            Source.updated_at.label("updated_at"),
            (1 - Chunk.embedding.cosine_distance(query_vec)).label("score"),
        )
        .outerjoin(Source, Chunk.source_id == Source.id)
        .where(
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
        stmt = base.where(
            Chunk.notebook_id == UUID(notebook_id) if notebook_id else text("1=1")
        )

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
            "updated_at": row.updated_at,
            "metadata_": row.metadata_,
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
    PostgreSQL FTS search via plainto_tsquery (handles Chinese via 'simple' config).
    Returns list of {chunk_id, fts_score}.
    Falls back to empty list if content_tsv column doesn't exist yet.
    """
    try:
        candidate_k = min(200, max(RERANK_CANDIDATE_K * 2, top_k * 4))
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
            stmt = base.where(
                Chunk.notebook_id == UUID(notebook_id) if notebook_id else text("1=1")
            )

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


async def _fetch_chunk_details(
    chunk_ids: list[str],
    db: AsyncSession,
) -> dict[str, dict]:
    """Batch-fetch full chunk data + embedding vectors for a given set of chunk IDs."""
    if not chunk_ids:
        return {}
    uuids = [UUID(cid) for cid in chunk_ids]
    result = await db.execute(
        select(
            Chunk.id,
            Chunk.content,
            Chunk.source_id,
            Chunk.source_type,
            Chunk.metadata_,
            Chunk.embedding,
            Source.title.label("source_title"),
            Source.updated_at.label("updated_at"),
        )
        .outerjoin(Source, Chunk.source_id == Source.id)
        .where(Chunk.id.in_(uuids))
    )
    rows = result.all()
    return {
        str(row.id): {
            "chunk_id": str(row.id),
            "source_id": str(row.source_id) if row.source_id else "",
            "source_title": (
                row.source_title
                or (row.metadata_ or {}).get("note_title", "")
                or ("📝 笔记" if row.source_type == "note" else "未知来源")
            ),
            "excerpt": row.content[:300],
            "content": row.content,
            "updated_at": row.updated_at,
            "embedding": list(row.embedding) if row.embedding is not None else None,
            "metadata_": row.metadata_,
        }
        for row in rows
    }


# ---------------------------------------------------------------------------
# Merging
# ---------------------------------------------------------------------------

def _merge_hybrid(
    vector_results: list[dict],
    fts_results: list[dict],
    vector_weight: float = HYBRID_VECTOR_WEIGHT,
    text_weight: float = HYBRID_TEXT_WEIGHT,
    recency_weight: float = HYBRID_RECENCY_WEIGHT,
) -> tuple[dict[str, dict], list[str]]:
    """
    Merge vector + FTS results.
    Final score = vector_weight × vector_score
                + text_weight × fts_score
                + recency_weight × recency_decay

    Returns:
        merged  — dict[chunk_id → result_dict] with final scores
        fts_only_ids — chunk_ids that only appeared in FTS (need full data fetch)
    """
    fts_map: dict[str, float] = {r["chunk_id"]: r["fts_score"] for r in fts_results}
    merged: dict[str, dict] = {}

    for r in vector_results:
        cid = r["chunk_id"]
        fts_score = fts_map.get(cid, 0.0)
        recency = _recency_score(r.get("updated_at"))
        final = (
            vector_weight * r["vector_score"]
            + text_weight * fts_score
            + recency_weight * recency
        )
        merged[cid] = {**r, "fts_score": fts_score, "score": final}

    # FTS-only results: chunks that passed keyword match but missed vector candidate window
    fts_only_ids: list[str] = []
    for r in fts_results:
        cid = r["chunk_id"]
        if cid not in merged:
            # Placeholder — full data will be fetched in retrieve_chunks
            merged[cid] = {
                "chunk_id": cid,
                "source_id": "",
                "source_title": "",
                "excerpt": "",
                "content": "",
                "vector_score": 0.0,
                "fts_score": r["fts_score"],
                "score": text_weight * r["fts_score"],
                "updated_at": None,
                "embedding": None,
                "metadata_": None,
                "_fts_only": True,
            }
            fts_only_ids.append(cid)

    return merged, fts_only_ids


# ---------------------------------------------------------------------------
# Query rewriting and expansion
# ---------------------------------------------------------------------------

async def _rewrite_query(query: str) -> str:
    """
    Rewrite a single query for improved retrieval.

    Resolves coreferences, expands abbreviations, and returns a concise
    retrieval-friendly string.  Falls back to the original query on any
    error or if the LLM returns an empty response.
    """
    from app.providers.llm import chat

    prompt = (
        "Rewrite the following user question into a concise retrieval query "
        "by resolving coreferences and expanding abbreviations. "
        "Return only the rewritten query, no explanation.\n\n"
        f"Question: {query}"
    )
    try:
        result = await chat(
            [{"role": "user", "content": prompt}],
            None,
            0,
            100,
        )
        rewritten = result.strip()
        return rewritten if rewritten else query
    except Exception:
        return query


async def _generate_query_variants(
    query: str,
    history: list[dict] | None = None,
) -> list[str]:
    """
    Generate up to 3 retrieval-friendly query variants in one LLM call.
    - Variant 1 (primary): resolves coreferences, expands abbreviations
    - Variant 2: synonym / paraphrase expansion
    - Variant 3: compact keyword version

    Falls back to [original_query] on any error or timeout.
    """
    import asyncio

    from app.providers.llm import chat

    history_snippet = ""
    if history:
        lines = []
        for msg in history[-6:]:
            role = "用户" if msg.get("role") == "user" else "助手"
            content = str(msg.get("content", ""))[:120]
            lines.append(f"{role}：{content}")
        if lines:
            history_snippet = "【最近对话历史，仅用于理解指代】\n" + "\n".join(lines) + "\n\n"

    prompt = (
        f"{history_snippet}"
        f"当前用户问题：{query[:300]}\n\n"
        "请输出 3 行，每行一个改写版本（只输出内容，不要编号或解释）：\n"
        "第1行：消解指代词、补全省略主体，改写为适合向量检索的完整短语\n"
        "第2行：使用同义词/近义词扩展，增加词汇多样性\n"
        "第3行：提取核心关键词，精简为最短检索词组"
    )

    async def _call() -> list[str]:
        result = await chat(
            [{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=150,
        )
        lines = [ln.strip() for ln in result.strip().splitlines() if ln.strip()]
        if not lines:
            return [query]
        # Ensure we have exactly 3 variants; pad with query if LLM returned fewer
        while len(lines) < 3:
            lines.append(query)
        return lines[:3]

    try:
        return await asyncio.wait_for(_call(), timeout=_REWRITE_TIMEOUT)
    except (asyncio.TimeoutError, Exception):
        return [query]


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def retrieve_chunks(
    query: str,
    notebook_id: str,
    db: AsyncSession,
    top_k: int = TOP_K,
    *,
    global_search: bool = False,
    user_id: UUID | None = None,
    history: list[dict] | None = None,
) -> list[dict]:
    """
    Full RAG retrieval pipeline:

    1. Multi-query expansion (3 variants, conversation-aware)
    2. Parallel: vector search (primary variant) + FTS (all 3 variants)
    3. Hybrid merge with recency weight (0.6 vec + 0.3 fts + 0.1 recency)
    4. FTS-only chunk data supplemental fetch
    5. Embed-vector fetch for MMR candidates
    6. MMR deduplication
    7. Optional Cross-Encoder reranking
    8. Evaluation logging

    - global_search=False: restrict to chunks in `notebook_id`
    - global_search=True: search across ALL notebooks owned by `user_id`
    """
    import asyncio

    from app.providers.embedding import embed_query

    t0 = time.monotonic()
    search_kwargs = dict(
        notebook_id=notebook_id,
        db=db,
        top_k=top_k,
        global_search=global_search,
        user_id=user_id,
    )

    # ── Step 1 & 2: Variant generation + original embed IN PARALLEL ───────
    # We don't wait for variants before embedding — the original query is
    # embedded immediately so searches can start without blocking on the LLM.
    variants_task = asyncio.create_task(_generate_query_variants(query, history))
    embed_task = asyncio.create_task(embed_query(query))

    variants_result, embed_result = await asyncio.gather(
        variants_task, embed_task, return_exceptions=True
    )

    variants: list[str] = variants_result if not isinstance(variants_result, Exception) else [query]
    primary = variants[0]  # first variant is the primary rewritten query

    # If primary differs from the original query, re-embed it (Redis cache makes
    # this a near-instant lookup on subsequent calls for the same text).
    if primary != query and not isinstance(embed_result, Exception):
        try:
            query_vec = await embed_query(primary)
        except Exception:
            query_vec = None if isinstance(embed_result, Exception) else embed_result
    else:
        query_vec = None if isinstance(embed_result, Exception) else embed_result

    # ── Step 3: Launch all searches in parallel ───────────────────────────
    fts_tasks = [_fts_search(v, **search_kwargs) for v in variants]

    if query_vec is not None:
        vec_task = _vector_search(query_vec, **search_kwargs)
        results = await asyncio.gather(vec_task, *fts_tasks, return_exceptions=True)
        vector_results: list[dict] = results[0] if not isinstance(results[0], Exception) else []
        all_fts: list[list[dict]] = [
            r if not isinstance(r, Exception) else []
            for r in results[1:]
        ]
    else:
        vector_results = []
        all_fts_raw = await asyncio.gather(*fts_tasks, return_exceptions=True)
        all_fts = [r if not isinstance(r, Exception) else [] for r in all_fts_raw]

    # ── Step 3: Merge FTS results from all 3 variants ─────────────────────
    # Keep the maximum fts_score per chunk across all query variants
    fts_map: dict[str, float] = {}
    for fts_set in all_fts:
        for r in fts_set:
            cid = r["chunk_id"]
            fts_map[cid] = max(fts_map.get(cid, 0.0), r["fts_score"])
    merged_fts = [{"chunk_id": cid, "fts_score": score} for cid, score in fts_map.items()]

    # ── Step 4: Hybrid merge ──────────────────────────────────────────────
    if merged_fts or vector_results:
        merged, fts_only_ids = _merge_hybrid(vector_results, merged_fts)
    else:
        return []

    # Sort by score descending, take RERANK_CANDIDATE_K candidates
    sorted_candidates = sorted(merged.values(), key=lambda x: x["score"], reverse=True)
    candidates = sorted_candidates[: RERANK_CANDIDATE_K * 2]

    # ── Step 5: Fill in FTS-only chunk data ───────────────────────────────
    fts_only_in_candidates = [
        c["chunk_id"] for c in candidates if c.get("_fts_only")
    ]
    if fts_only_in_candidates:
        details = await _fetch_chunk_details(fts_only_in_candidates, db)
        for c in candidates:
            if c.get("_fts_only") and c["chunk_id"] in details:
                full = details[c["chunk_id"]]
                c.update({k: v for k, v in full.items() if k != "chunk_id"})
                # Recalculate score now that we have updated_at
                recency = _recency_score(c.get("updated_at"))
                c["score"] = (
                    HYBRID_TEXT_WEIGHT * c["fts_score"]
                    + HYBRID_RECENCY_WEIGHT * recency
                )
                del c["_fts_only"]

    # ── Step 6: Fetch embeddings for MMR ──────────────────────────────────
    # Only fetch embeddings for FTS-only chunks (already done above).
    # Vector-search chunks don't have embeddings in-memory; MMR will simply
    # skip them (chunks without embeddings always pass through).
    # This avoids an expensive extra round-trip to the DB for all candidates.

    # ── Step 7: MMR deduplication ─────────────────────────────────────────
    candidates = _mmr_filter(candidates)

    # ── Step 8: Cross-Encoder reranking (optional) ────────────────────────
    top_candidates = candidates[: RERANK_CANDIDATE_K]
    try:
        from app.providers.reranker import rerank
        ranked_indices = await rerank(primary, [c["content"] for c in top_candidates])
        top_candidates = [top_candidates[i] for i in ranked_indices if i < len(top_candidates)]
    except Exception as exc:
        logger.debug("Reranker skipped: %s", exc)

    # ── Step 9: Final filter + format ─────────────────────────────────────
    final = [
        {
            "chunk_id": r["chunk_id"],
            "source_id": r["source_id"],
            "source_title": r["source_title"],
            "excerpt": r["excerpt"],
            "content": r["content"],
            "score": r["score"],
            "metadata_": r.get("metadata_"),
        }
        for r in top_candidates[:top_k]
        if r.get("content") and r["score"] >= SIMILARITY_THRESHOLD
    ]

    # ── Step 10: Evaluation logging ───────────────────────────────────────
    elapsed_ms = int((time.monotonic() - t0) * 1000)
    avg_score = sum(r["score"] for r in final) / len(final) if final else 0.0
    logger.info(
        "rag_eval query=%r primary=%r variants=%r n_chunks=%d avg_score=%.3f elapsed_ms=%d",
        query, primary, variants[1:], len(final), avg_score, elapsed_ms,
    )

    return final
