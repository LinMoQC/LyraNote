"""Cross-notebook knowledge discovery."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.domains.ai.schemas import CrossNotebookChunk, CrossNotebookOut
from app.models import Chunk, Notebook, Source, NotebookSummary
from app.schemas.response import ApiResponse, success

router = APIRouter()


@router.get(
    "/notebooks/{notebook_id}/related-knowledge",
    response_model=ApiResponse[CrossNotebookOut],
)
async def get_related_knowledge(notebook_id: UUID, current_user: CurrentUser, db: DbDep):
    """Find related content in other notebooks based on the current notebook's summary."""
    from app.providers.embedding import embed_query

    summary_result = await db.execute(
        select(NotebookSummary.summary_md).where(NotebookSummary.notebook_id == notebook_id)
    )
    summary_md = summary_result.scalar_one_or_none()
    if not summary_md or len(summary_md.strip()) < 20:
        return success(CrossNotebookOut(chunks=[]))

    query_vec = await embed_query(summary_md[:300])

    stmt = (
        select(
            Chunk.id,
            Chunk.content,
            Chunk.source_id,
            Chunk.notebook_id,
            Source.title.label("source_title"),
            Notebook.title.label("notebook_title"),
            (1 - Chunk.embedding.cosine_distance(query_vec)).label("score"),
        )
        .outerjoin(Source, Chunk.source_id == Source.id)
        .join(Notebook, Chunk.notebook_id == Notebook.id)
        .where(
            Notebook.user_id == current_user.id,
            Chunk.notebook_id != notebook_id,
            ((Source.status == "indexed") | (Chunk.source_type == "note")),
        )
        .order_by(Chunk.embedding.cosine_distance(query_vec))
        .limit(10)
    )

    result = await db.execute(stmt)
    rows = result.all()

    chunks = [
        CrossNotebookChunk(
            notebook_title=row.notebook_title or "未命名笔记本",
            source_title=row.source_title or "📝 笔记",
            excerpt=row.content[:300],
            score=round(float(row.score), 3),
            chunk_id=str(row.id),
            notebook_id=str(row.notebook_id),
        )
        for row in rows
        if float(row.score) >= 0.35
    ][:5]

    return success(CrossNotebookOut(chunks=chunks))
