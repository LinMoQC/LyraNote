from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select

from app.models import UserMemory


@pytest.mark.asyncio
async def test_patch_memory_doc_syncs_structured_memories(
    client,
    auth_headers,
    test_user,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    monkeypatch.setattr("app.config.settings.memory_dir", str(tmp_path))

    async def _fake_embed_query(_text: str) -> list[float]:
        return [0.0] * 1536

    monkeypatch.setattr("app.providers.embedding.embed_query", _fake_embed_query)

    user, _password = test_user
    payload = {
        "content_md": (
            "# 我的 AI 记忆\n\n"
            "## About Me\n"
            "I build agents.\n\n"
            "## Constraints\n"
            "Keep answers short.\n"
        )
    }

    response = await client.patch("/api/v1/memory/doc", json=payload, headers=auth_headers)

    assert response.status_code == 204

    rows = (
        await db_session.execute(
            select(UserMemory).where(UserMemory.user_id == user.id).order_by(UserMemory.key.asc())
        )
    ).scalars().all()
    assert [row.key for row in rows] == ["file_about_me", "file_constraints"]

    get_response = await client.get("/api/v1/memory/doc", headers=auth_headers)
    assert get_response.status_code == 200
    assert get_response.json()["data"]["content_md"] == payload["content_md"]
