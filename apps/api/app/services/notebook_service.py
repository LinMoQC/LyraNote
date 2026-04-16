from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import NotFoundError
from app.models import Note, Notebook, Source
from app.services.public_home_service import refresh_public_home_draft


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


def _note_count_subquery():
    return (
        select(func.count(Note.id))
        .where(Note.notebook_id == Notebook.id)
        .correlate(Notebook)
        .scalar_subquery()
        .label("note_count")
    )


def _build_out(nb: Notebook, src_count: int, note_count: int, word_count: int) -> Notebook:
    nb.source_count = src_count
    nb.note_count = note_count
    nb.word_count = word_count
    nb.summary_md = nb.summary.summary_md if nb.summary else None
    return nb


async def _fill_counts(db: AsyncSession, notebook: Notebook) -> Notebook:
    src_res = await db.execute(
        select(func.count(Source.id)).where(Source.notebook_id == notebook.id)
    )
    note_res = await db.execute(
        select(func.count(Note.id)).where(Note.notebook_id == notebook.id)
    )
    wc_res = await db.execute(
        select(func.coalesce(func.sum(Note.word_count), 0)).where(Note.notebook_id == notebook.id)
    )
    notebook.source_count = src_res.scalar() or 0
    notebook.note_count = note_res.scalar() or 0
    notebook.word_count = wc_res.scalar() or 0
    notebook.summary_md = notebook.summary.summary_md if notebook.summary else None
    return notebook


async def get_owned_notebook(db: AsyncSession, notebook_id: UUID, user_id: UUID) -> Notebook:
    result = await db.execute(
        select(Notebook)
        .options(selectinload(Notebook.summary))
        .where(Notebook.id == notebook_id, Notebook.user_id == user_id)
    )
    notebook = result.scalar_one_or_none()
    if notebook is None:
        raise NotFoundError("笔记本不存在")
    return notebook


async def list_user_notebooks(db: AsyncSession, user_id: UUID) -> list[Notebook]:
    result = await db.execute(
        select(Notebook, _source_count_subquery(), _note_count_subquery(), _word_count_subquery())
        .options(selectinload(Notebook.summary))
        .where(Notebook.user_id == user_id, Notebook.is_global.is_(False))
        .order_by(Notebook.updated_at.desc())
    )
    return [_build_out(nb, src_cnt, note_cnt, wc) for nb, src_cnt, note_cnt, wc in result.all()]


async def create_notebook(db: AsyncSession, user_id: UUID, payload: dict) -> Notebook:
    notebook = Notebook(user_id=user_id, **payload)
    db.add(notebook)
    await db.flush()
    await db.refresh(notebook)
    await db.refresh(notebook, attribute_names=["summary"])
    return await _fill_counts(db, notebook)


async def get_or_create_global_notebook(db: AsyncSession, user_id: UUID) -> Notebook:
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
    return await _fill_counts(db, notebook)


async def get_notebook_detail(db: AsyncSession, notebook_id: UUID, user_id: UUID) -> Notebook:
    notebook = await get_owned_notebook(db, notebook_id, user_id)
    return await _fill_counts(db, notebook)


async def update_notebook(db: AsyncSession, notebook_id: UUID, user_id: UUID, changes: dict) -> Notebook:
    notebook = await get_owned_notebook(db, notebook_id, user_id)
    for field, value in changes.items():
        setattr(notebook, field, value)
    await db.flush()
    await db.refresh(notebook)
    await db.refresh(notebook, attribute_names=["summary"])
    return await _fill_counts(db, notebook)


async def publish_notebook(db: AsyncSession, notebook_id: UUID, user_id: UUID) -> Notebook:
    notebook = await get_owned_notebook(db, notebook_id, user_id)
    notebook.is_public = True
    notebook.published_at = datetime.now(timezone.utc)
    await db.flush()
    await refresh_public_home_draft(db, user_id)
    await db.refresh(notebook)
    await db.refresh(notebook, attribute_names=["summary"])
    return await _fill_counts(db, notebook)


async def unpublish_notebook(db: AsyncSession, notebook_id: UUID, user_id: UUID) -> Notebook:
    notebook = await get_owned_notebook(db, notebook_id, user_id)
    notebook.is_public = False
    await db.flush()
    await refresh_public_home_draft(db, user_id)
    await db.refresh(notebook)
    await db.refresh(notebook, attribute_names=["summary"])
    return await _fill_counts(db, notebook)


async def delete_notebook(db: AsyncSession, notebook_id: UUID, user_id: UUID) -> None:
    await get_owned_notebook(db, notebook_id, user_id)
    await db.execute(sql_delete(Notebook).where(Notebook.id == notebook_id))
    await db.commit()
