from __future__ import annotations

import uuid

import pytest

from app.agents.memory import build_prompt_context_bundle, load_prompt_context
from app.auth import hash_password
from app.models import AppConfig, User


def test_build_prompt_context_bundle_splits_identity_and_long_term_memories() -> None:
    bundle = build_prompt_context_bundle(
        scene="chat",
        user_memories=[
            {"key": "preferred_ai_name", "value": "Kami", "confidence": 0.9, "source": "conversation"},
            {"key": "writing_style", "value": "简洁", "confidence": 0.8, "source": "conversation"},
            {"key": "writing_style", "value": "简洁", "confidence": 0.6, "source": "file"},
            {"key": "diary_2026_04_22", "value": "old summary", "confidence": 0.5, "source": "file"},
        ],
    )

    assert [memory["key"] for memory in bundle.identity_memories] == ["preferred_ai_name"]
    assert [memory["key"] for memory in bundle.long_term_memories] == ["writing_style"]


@pytest.mark.asyncio
async def test_load_prompt_context_returns_standardized_bundle(db_session, monkeypatch):
    user = User(
        id=uuid.uuid4(),
        username=f"ctx_{uuid.uuid4().hex[:6]}",
        email=f"ctx_{uuid.uuid4().hex[:6]}@test.com",
        name="Context User",
        password_hash=hash_password("password123"),
    )
    db_session.add(user)
    db_session.add(AppConfig(key="ai_name", value="Kami"))
    await db_session.commit()

    async def _fake_build_memory_context(*_args, **_kwargs):
        return [
            {"key": "preferred_ai_name", "value": "Kami", "confidence": 0.95, "source": "conversation"},
            {"key": "current_focus", "value": "memory cleanup", "confidence": 0.8, "memory_kind": "project_state", "source": "conversation"},
        ]

    async def _fake_get_conversation_summary(*_args, **_kwargs):
        return "older summary"

    async def _fake_get_notebook_summary(*_args, **_kwargs):
        return {"summary_md": "notebook summary", "key_themes": ["memory"]}

    async def _fake_load_latest_portrait(*_args, **_kwargs):
        return {"identity_summary": "portrait summary"}

    async def _noop(*_args, **_kwargs):
        return 0

    monkeypatch.setattr("app.agents.memory.retrieval.build_memory_context", _fake_build_memory_context)
    monkeypatch.setattr("app.agents.memory.notebook.get_conversation_summary", _fake_get_conversation_summary)
    monkeypatch.setattr("app.agents.memory.notebook.get_notebook_summary", _fake_get_notebook_summary)
    monkeypatch.setattr("app.agents.portrait.loader.load_latest_portrait", _fake_load_latest_portrait)
    monkeypatch.setattr("app.services.memory_service.MemoryService.sync_memory_doc_if_stale", _noop)
    monkeypatch.setattr("app.services.memory_service.MemoryService.cleanup_runtime_memories", _noop)

    bundle = await load_prompt_context(
        user_id=user.id,
        query="帮我继续整理记忆系统",
        db=db_session,
        scene="research",
        notebook_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        include_portrait=True,
    )

    assert bundle.scene == "research"
    assert bundle.ai_name == "Kami"
    assert bundle.conversation_summary == "older summary"
    assert bundle.notebook_summary == {"summary_md": "notebook summary", "key_themes": ["memory"]}
    assert bundle.portrait == {"identity_summary": "portrait summary"}
    assert [memory["key"] for memory in bundle.identity_memories] == ["preferred_ai_name"]
    assert [memory["key"] for memory in bundle.long_term_memories] == ["current_focus"]
