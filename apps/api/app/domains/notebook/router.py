from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentUser, DbDep
from app.exceptions import NotFoundError
from app.models import Note, Notebook, Source
from app.schemas.response import ApiResponse, success
from .schemas import NotebookCreate, NotebookOut, NotebookUpdate

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _word_count_subquery():
    return (
        select(func.coalesce(func.sum(Note.word_count), 0))
        .where(Note.notebook_id == Notebook.id)
        .correlate(Notebook)
        .scalar_subquery()
        .label("wc")
    )


def _source_count_subquery():
    return (
        select(func.count(Source.id))
        .where(Source.notebook_id == Notebook.id)
        .correlate(Notebook)
        .scalar_subquery()
        .label("src_count")
    )


def _build_out(nb: Notebook, src_count: int, word_count: int) -> NotebookOut:
    nb.source_count = src_count
    nb.word_count = word_count
    nb.summary_md = nb.summary.summary_md if nb.summary else None
    return nb


async def _fill_counts(db, notebook: Notebook) -> Notebook:
    """Used for single-notebook endpoints (create/update/get)."""
    src_res = await db.execute(
        select(func.count(Source.id)).where(Source.notebook_id == notebook.id)
    )
    wc_res = await db.execute(
        select(func.coalesce(func.sum(Note.word_count), 0)).where(Note.notebook_id == notebook.id)
    )
    notebook.source_count = src_res.scalar() or 0
    notebook.word_count = wc_res.scalar() or 0
    notebook.summary_md = notebook.summary.summary_md if notebook.summary else None
    return notebook


async def _get_or_create_global_notebook(db, user_id) -> Notebook:
    result = await db.execute(
        select(Notebook)
        .options(selectinload(Notebook.summary))
        .where(Notebook.user_id == user_id, Notebook.is_global.is_(True))
    )
    notebook = result.scalar_one_or_none()
    if notebook is None:
        notebook = Notebook(
            user_id=user_id,
            title="全局知识库",
            description="全局来源，不绑定具体笔记本。",
            is_global=True,
            is_system=False,
            status="active",
        )
        db.add(notebook)
        await db.flush()
        await db.refresh(notebook)
        await db.refresh(notebook, attribute_names=["summary"])
    return notebook


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=ApiResponse[list[NotebookOut]])
async def list_notebooks(db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(Notebook, _source_count_subquery(), _word_count_subquery())
        .options(selectinload(Notebook.summary))
        .where(Notebook.user_id == current_user.id, Notebook.is_global.is_(False))
        .order_by(Notebook.updated_at.desc())
    )
    return success([_build_out(nb, src_cnt, wc) for nb, src_cnt, wc in result.all()])


@router.post("", response_model=ApiResponse[NotebookOut], status_code=status.HTTP_201_CREATED)
async def create_notebook(body: NotebookCreate, db: DbDep, current_user: CurrentUser):
    notebook = Notebook(user_id=current_user.id, **body.model_dump())
    db.add(notebook)
    await db.flush()
    await db.refresh(notebook)
    await db.refresh(notebook, attribute_names=["summary"])
    nb = await _fill_counts(db, notebook)
    out = NotebookOut.model_validate(nb)
    out.is_new = True  # Signal the frontend to open the import dialog
    return success(out)


@router.get("/global", response_model=ApiResponse[NotebookOut])
async def get_global_notebook(db: DbDep, current_user: CurrentUser):
    notebook = await _get_or_create_global_notebook(db, current_user.id)
    return success(await _fill_counts(db, notebook))


@router.get("/{notebook_id}", response_model=ApiResponse[NotebookOut])
async def get_notebook(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    notebook = await _get_owned(db, notebook_id, current_user.id)
    return success(await _fill_counts(db, notebook))


@router.patch("/{notebook_id}", response_model=ApiResponse[NotebookOut])
async def update_notebook(
    notebook_id: UUID, body: NotebookUpdate, db: DbDep, current_user: CurrentUser
):
    notebook = await _get_owned(db, notebook_id, current_user.id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(notebook, field, value)
    await db.flush()
    await db.refresh(notebook)
    await db.refresh(notebook, attribute_names=["summary"])
    return success(await _fill_counts(db, notebook))


@router.patch("/{notebook_id}/publish", response_model=ApiResponse[NotebookOut])
async def publish_notebook(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    notebook = await _get_owned(db, notebook_id, current_user.id)
    notebook.is_public = True
    notebook.published_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(notebook)
    await db.refresh(notebook, attribute_names=["summary"])
    return success(await _fill_counts(db, notebook))


@router.patch("/{notebook_id}/unpublish", response_model=ApiResponse[NotebookOut])
async def unpublish_notebook(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    notebook = await _get_owned(db, notebook_id, current_user.id)
    notebook.is_public = False
    await db.flush()
    await db.refresh(notebook)
    await db.refresh(notebook, attribute_names=["summary"])
    return success(await _fill_counts(db, notebook))


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notebook(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    # Verify ownership first (raises 404 if not found / not owned)
    await _get_owned(db, notebook_id, current_user.id)
    # Use Core DELETE so the DB handles ON DELETE CASCADE itself.
    # The ORM path fails because NotebookSummary.notebook_id is both FK and PK —
    # SQLAlchemy ORM tries to NULL-out the FK before deleting, which is illegal for a PK.
    await db.execute(sql_delete(Notebook).where(Notebook.id == notebook_id))
    await db.commit()  # Commit before response so router.refresh() sees the change


async def _get_owned(db, notebook_id: UUID, user_id) -> Notebook:
    result = await db.execute(
        select(Notebook)
        .options(selectinload(Notebook.summary))
        .where(Notebook.id == notebook_id, Notebook.user_id == user_id)
    )
    notebook = result.scalar_one_or_none()
    if notebook is None:
        raise NotFoundError("笔记本不存在")
    return notebook
