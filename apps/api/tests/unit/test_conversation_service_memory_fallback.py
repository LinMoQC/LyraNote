from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import uuid4

import pytest

from app.services.conversation_service import _load_user_memories_safely


class _FakeSession:
    @asynccontextmanager
    async def begin_nested(self):
        yield self


@pytest.mark.asyncio
async def test_load_user_memories_safely_falls_back_to_empty_on_context_error(monkeypatch):
    async def _boom(*_args, **_kwargs):
        raise RuntimeError("column user_memories.memory_kind does not exist")

    monkeypatch.setattr("app.agents.memory.build_memory_context", _boom)

    result = await _load_user_memories_safely(
        _FakeSession(),
        uuid4(),
        current_query="继续",
        scene="research",
    )

    assert result == []


@pytest.mark.asyncio
async def test_load_user_memories_safely_uses_legacy_loader_when_query_missing(monkeypatch):
    async def _fake_get_user_memories(*_args, **_kwargs):
        return [{"key": "writing_style", "value": "简洁", "confidence": 0.9}]

    monkeypatch.setattr("app.agents.memory.get_user_memories", _fake_get_user_memories)

    result = await _load_user_memories_safely(_FakeSession(), uuid4())

    assert result == [{"key": "writing_style", "value": "简洁", "confidence": 0.9}]
