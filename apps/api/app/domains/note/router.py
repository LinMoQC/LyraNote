import asyncio
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.exceptions import NotFoundError
from app.models import Notebook, Note
from app.schemas.response import ApiResponse, success
from .schemas import NoteCreate, NoteOut, NoteUpdate

router = APIRouter(tags=["notes"])


def _compute_word_count(text: str | None) -> int:
    if not text:
        return 0
    import re
    chinese = len(re.findall(r'[\u4e00-\u9fff]', text))
    english = len(re.findall(r'[a-zA-Z0-9]+', text))
    return chinese + english


def _dispatch_summary(notebook_id: UUID, content_text: str | None) -> None:
    """Fire-and-forget: enqueue summary generation if there's enough content."""
    if not content_text or len(content_text.strip()) < 50:
        return
    try:
        from app.workers.tasks import generate_notebook_summary
        generate_notebook_summary.delay(str(notebook_id), content_text)
    except Exception:
        pass  # Celery unavailable in dev — skip silently


def _dispatch_note_indexing(note_id: UUID) -> None:
    """Fire-and-forget: enqueue note indexing to knowledge base."""
    try:
        from app.workers.tasks import index_note
        index_note.delay(str(note_id))
    except Exception:
        pass


async def _refresh_notebook_summary_safe(notebook_id: UUID) -> None:
    """Fire-and-forget: refresh notebook summary from all indexed sources."""
    from app.agents.memory import refresh_notebook_summary
    from app.database import AsyncSessionLocal
    import logging
    try:
        async with AsyncSessionLocal() as session:
            await refresh_notebook_summary(notebook_id, session)
            await session.commit()
    except Exception as exc:
        logging.getLogger(__name__).debug("Notebook summary refresh skipped: %s", exc)


@router.get("/notebooks/{notebook_id}/notes", response_model=ApiResponse[list[NoteOut]])
async def list_notes(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    await _assert_notebook_owner(db, notebook_id, current_user.id)
    result = await db.execute(
        select(Note)
        .where(Note.notebook_id == notebook_id)
        .order_by(Note.updated_at.desc())
    )
    return success(result.scalars().all())


@router.post(
    "/notebooks/{notebook_id}/notes",
    response_model=ApiResponse[NoteOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_note(
    notebook_id: UUID, body: NoteCreate, db: DbDep, current_user: CurrentUser
):
    await _assert_notebook_owner(db, notebook_id, current_user.id)
    data = body.model_dump()
    if data.get("word_count") is None:
        data["word_count"] = _compute_word_count(data.get("content_text"))
    note = Note(notebook_id=notebook_id, user_id=current_user.id, **data)
    db.add(note)
    await db.flush()
    await db.refresh(note)
    _dispatch_summary(notebook_id, body.content_text)
    asyncio.create_task(_refresh_notebook_summary_safe(notebook_id))
    return success(note)


@router.get("/notes/{note_id}", response_model=ApiResponse[NoteOut])
async def get_note(note_id: UUID, db: DbDep, current_user: CurrentUser):
    return success(await _get_owned_note(db, note_id, current_user.id))


@router.patch("/notes/{note_id}", response_model=ApiResponse[NoteOut])
async def update_note(
    note_id: UUID, body: NoteUpdate, db: DbDep, current_user: CurrentUser
):
    note = await _get_owned_note(db, note_id, current_user.id)
    updates = body.model_dump(exclude_none=True)

    if "content_text" in updates and updates.get("word_count") is None:
        updates["word_count"] = _compute_word_count(updates["content_text"])

    for field, value in updates.items():
        setattr(note, field, value)

    await db.flush()
    await db.refresh(note)

    if "content_text" in updates:
        _dispatch_summary(note.notebook_id, updates["content_text"])
        asyncio.create_task(_refresh_notebook_summary_safe(note.notebook_id))
        _dispatch_note_indexing(note.id)

    return success(note)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(note_id: UUID, db: DbDep, current_user: CurrentUser):
    note = await _get_owned_note(db, note_id, current_user.id)
    await db.delete(note)


async def _assert_notebook_owner(db, notebook_id: UUID, user_id):
    result = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == user_id)
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("笔记本不存在")


async def _get_owned_note(db, note_id: UUID, user_id) -> Note:
    result = await db.execute(
        select(Note)
        .join(Notebook, Note.notebook_id == Notebook.id)
        .where(Note.id == note_id, Notebook.user_id == user_id)
    )
    note = result.scalar_one_or_none()
    if note is None:
        raise NotFoundError("笔记不存在")
    return note
