from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import uuid4

import pytest

from app.agents.memory import build_prompt_context_bundle
from app.services.conversation_service import _load_prompt_context_safely


class _FakeSession:
    @asynccontextmanager
    async def begin_nested(self):
        yield self


@pytest.mark.asyncio
async def test_load_prompt_context_safely_falls_back_to_empty_bundle_on_error(monkeypatch):
    async def _boom(*_args, **_kwargs):
        raise RuntimeError("prompt context exploded")

    monkeypatch.setattr("app.agents.memory.load_prompt_context", _boom)

    result = await _load_prompt_context_safely(
        _FakeSession(),
        uuid4(),
        current_query="继续",
        scene="chat",
    )

    assert result.scene == "chat"
    assert result.all_memories == []
    assert result.portrait is None


@pytest.mark.asyncio
async def test_load_prompt_context_safely_returns_loaded_bundle(monkeypatch):
    expected = build_prompt_context_bundle(
        scene="research",
        user_memories=[{"key": "writing_style", "value": "简洁", "confidence": 0.9}],
        conversation_summary="older summary",
    )

    async def _fake_loader(*_args, **_kwargs):
        return expected

    monkeypatch.setattr("app.agents.memory.load_prompt_context", _fake_loader)

    result = await _load_prompt_context_safely(
        _FakeSession(),
        uuid4(),
        current_query="继续",
        scene="research",
        include_portrait=True,
    )

    assert result is expected
    assert result.scene == "research"
    assert result.all_memories == expected.all_memories
