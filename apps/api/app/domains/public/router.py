from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.dependencies import DbDep
from app.exceptions import NotFoundError
from app.models import Note, Notebook
from app.schemas.response import ApiResponse, success
from .schemas import PublicNotebookDetailOut, PublicNotebookOut, PublicNoteOut

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/notebooks", response_model=ApiResponse[list[PublicNotebookOut]])
async def list_public_notebooks(db: DbDep):
    wc_sub = (
        select(func.coalesce(func.sum(Note.word_count), 0))
        .where(Note.notebook_id == Notebook.id)
        .correlate(Notebook)
        .scalar_subquery()
        .label("wc")
    )
    result = await db.execute(
        select(Notebook, wc_sub)
        .options(selectinload(Notebook.summary))
        .where(Notebook.is_public.is_(True))
        .order_by(Notebook.published_at.desc())
    )
    items = []
    for nb, wc in result.all():
        items.append(PublicNotebookOut(
            id=nb.id,
            title=nb.title,
            description=nb.description,
            summary_md=nb.summary.summary_md if nb.summary else None,
            cover_emoji=nb.cover_emoji,
            cover_gradient=nb.cover_gradient,
            source_count=nb.source_count,
            word_count=wc,
            published_at=nb.published_at,
        ))
    return success(items)


@router.get("/notebooks/{notebook_id}", response_model=ApiResponse[PublicNotebookDetailOut])
async def get_public_notebook(notebook_id: UUID, db: DbDep):
    result = await db.execute(
        select(Notebook)
        .options(selectinload(Notebook.summary), selectinload(Notebook.notes))
        .where(Notebook.id == notebook_id, Notebook.is_public.is_(True))
    )
    nb = result.scalar_one_or_none()
    if nb is None:
        raise NotFoundError("笔记本不存在或未公开")

    wc_res = await db.execute(
        select(func.coalesce(func.sum(Note.word_count), 0)).where(Note.notebook_id == nb.id)
    )
    wc = wc_res.scalar() or 0

    notes_sorted = sorted(nb.notes, key=lambda n: n.updated_at, reverse=True)
    return success(PublicNotebookDetailOut(
        id=nb.id,
        title=nb.title,
        description=nb.description,
        summary_md=nb.summary.summary_md if nb.summary else None,
        cover_emoji=nb.cover_emoji,
        cover_gradient=nb.cover_gradient,
        source_count=nb.source_count,
        word_count=wc,
        published_at=nb.published_at,
        notes=[PublicNoteOut.model_validate(n) for n in notes_sorted],
    ))
