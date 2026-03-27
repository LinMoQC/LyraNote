"""Cross-notebook knowledge discovery."""

from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.domains.ai.schemas import CrossNotebookChunk, CrossNotebookOut
from app.models import Chunk, Notebook, NotebookSummary
from app.schemas.response import ApiResponse, success

router = APIRouter()


@router.get(
    "/notebooks/{notebook_id}/related-knowledge",
    response_model=ApiResponse[CrossNotebookOut],
)
async def get_related_knowledge(notebook_id: UUID, current_user: CurrentUser, db: DbDep):
    """Find related content in other notebooks based on the current notebook's hybrid RAG search."""
    from app.agents.rag.retrieval import retrieve_chunks

    own = await db.execute(
        select(Notebook.id).where(
            Notebook.id == notebook_id,
            Notebook.user_id == current_user.id,
        )
    )
    if own.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    summary_result = await db.execute(
        select(NotebookSummary.summary_md).where(NotebookSummary.notebook_id == notebook_id)
    )
    summary_md = summary_result.scalar_one_or_none()
    if not summary_md or len(summary_md.strip()) < 20:
        return success(CrossNotebookOut(chunks=[]))

    q = summary_md[:500].strip()
    raw = await retrieve_chunks(
        q,
        None,
        db,
        top_k=5,
        global_search=True,
        user_id=current_user.id,
        exclude_notebook_id=notebook_id,
        _precomputed_variants=[q],
    )
    if not raw:
        return success(CrossNotebookOut(chunks=[]))

    ids = [UUID(c["chunk_id"]) for c in raw]
    meta_result = await db.execute(
        select(Chunk.id, Chunk.notebook_id, Notebook.title.label("notebook_title"))
        .join(Notebook, Chunk.notebook_id == Notebook.id)
        .where(Chunk.id.in_(ids))
    )
    meta = {
        str(r.id): (str(r.notebook_id), r.notebook_title or "未命名笔记本")
        for r in meta_result.all()
    }

    chunks = [
        CrossNotebookChunk(
            notebook_title=meta.get(c["chunk_id"], (None, "未命名笔记本"))[1],
            source_title=c.get("source_title") or "📝 笔记",
            excerpt=(c.get("excerpt") or c.get("content") or "")[:300],
            score=round(float(c.get("score") or 0), 3),
            chunk_id=str(c.get("chunk_id", "")),
            notebook_id=meta.get(c["chunk_id"], ("",))[0] or "",
        )
        for c in raw
        if c.get("chunk_id") in meta
    ]

    return success(CrossNotebookOut(chunks=chunks))
