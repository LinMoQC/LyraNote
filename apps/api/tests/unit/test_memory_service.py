from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.auth import hash_password
from app.models import AppConfig, User, UserMemory
from app.services.memory_service import MemoryService


def _memory_doc(content: str) -> str:
    return "# 我的 AI 记忆\n\n" + content.strip() + "\n"


@pytest.mark.asyncio
async def test_update_memory_doc_syncs_and_removes_deleted_sections(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    monkeypatch.setattr("app.config.settings.memory_dir", str(tmp_path))

    async def _fake_embed_query(_text: str) -> list[float]:
        return [0.0] * 1536

    monkeypatch.setattr("app.providers.embedding.embed_query", _fake_embed_query)

    user = User(
        id=uuid.uuid4(),
        username=f"memsvc_{uuid.uuid4().hex[:6]}",
        email=f"memsvc_{uuid.uuid4().hex[:6]}@test.com",
        name="Memory Service User",
        password_hash=hash_password("password123"),
    )
    db_session.add(user)
    await db_session.commit()

    service = MemoryService(db_session, user.id)

    await service.update_memory_doc(
        _memory_doc(
            """
## About Me
I build agents.

## Constraints
Keep answers short.
"""
        )
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(UserMemory).where(UserMemory.user_id == user.id).order_by(UserMemory.key.asc())
        )
    ).scalars().all()
    assert [row.key for row in rows] == ["file_about_me", "file_constraints"]

    await service.update_memory_doc(
        _memory_doc(
            """
## Constraints
Keep answers short.
"""
        )
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(UserMemory).where(UserMemory.user_id == user.id).order_by(UserMemory.key.asc())
        )
    ).scalars().all()
    assert [row.key for row in rows] == ["file_constraints"]

    sync_meta = (
        await db_session.execute(
            select(AppConfig).where(AppConfig.key == f"memory_doc_sync_mtime:{user.id}")
        )
    ).scalar_one_or_none()
    assert sync_meta is not None
    assert sync_meta.value


@pytest.mark.asyncio
async def test_update_memory_doc_cleans_diary_and_file_duplicates(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    monkeypatch.setattr("app.config.settings.memory_dir", str(tmp_path))

    async def _fake_embed_query(_text: str) -> list[float]:
        return [0.0] * 1536

    monkeypatch.setattr("app.providers.embedding.embed_query", _fake_embed_query)

    user = User(
        id=uuid.uuid4(),
        username=f"memdup_{uuid.uuid4().hex[:6]}",
        email=f"memdup_{uuid.uuid4().hex[:6]}@test.com",
        name="Memory Cleanup User",
        password_hash=hash_password("password123"),
    )
    db_session.add(user)
    await db_session.flush()

    db_session.add(
        UserMemory(
            id=uuid.uuid4(),
            user_id=user.id,
            key="file_about_me",
            value="I build agents.",
            confidence=0.9,
            memory_type="fact",
            memory_kind="profile",
            access_count=0,
            source="conversation",
            evidence="message-1",
            conflict_flag=False,
        )
    )
    db_session.add(
        UserMemory(
            id=uuid.uuid4(),
            user_id=user.id,
            key="diary_2026_04_22",
            value="old diary memory",
            confidence=0.5,
            memory_type="fact",
            memory_kind="project_state",
            access_count=0,
            source="file",
            evidence="diary",
            conflict_flag=False,
        )
    )
    await db_session.commit()

    service = MemoryService(db_session, user.id)
    await service.update_memory_doc(
        _memory_doc(
            """
## About Me
I build agents.

## Constraints
Keep answers short.
"""
        )
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(UserMemory).where(UserMemory.user_id == user.id).order_by(UserMemory.key.asc(), UserMemory.source.asc())
        )
    ).scalars().all()

    assert [(row.key, row.source) for row in rows] == [
        ("file_about_me", "conversation"),
        ("file_constraints", "file"),
    ]
