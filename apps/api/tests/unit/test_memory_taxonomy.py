from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.agents.memory.extraction import (
    _upsert_memory,
    default_ttl_days_for_kind,
    infer_memory_kind,
)
from app.agents.memory.retrieval import (
    _apply_temporal_decay,
    _scene_weight,
    build_memory_context,
)
from app.models import UserMemory


class _ScalarResult:
    def __init__(self, scalar=None, scalars=None):
        self._scalar = scalar
        self._scalars = scalars or []

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._scalars))


class _FakeAsyncSession:
    def __init__(self, execute_side_effect=None):
        self.execute = AsyncMock(side_effect=execute_side_effect or [])
        self.flush = AsyncMock()
        self.added: list[object] = []

    def add(self, obj):
        self.added.append(obj)


def test_infer_memory_kind_prefers_taxonomy_hints():
    assert infer_memory_kind("writing_style", "preference") == "preference"
    assert infer_memory_kind("current_research_topic", "fact", ttl_days=21) == "project_state"
    assert infer_memory_kind("paper_reference_url", "fact") == "reference"
    assert infer_memory_kind("professional_background", "fact") == "profile"


def test_default_ttl_days_only_applies_to_project_state():
    assert default_ttl_days_for_kind("project_state", None) == 21
    assert default_ttl_days_for_kind("reference", None) is None
    assert default_ttl_days_for_kind("profile", 14) == 14


def test_project_state_memories_decay_but_profile_memories_do_not():
    old = datetime.now(timezone.utc) - timedelta(days=42)

    decayed = _apply_temporal_decay(1.0, old, "project_state")
    evergreen = _apply_temporal_decay(1.0, old, "profile")

    assert decayed < 1.0
    assert evergreen == 1.0


def test_scene_weight_favors_relevant_memory_kinds():
    assert _scene_weight("project_state", "research") > 1.0
    assert _scene_weight("reference", "learning") > 1.0
    assert _scene_weight("profile", "writing") > 1.0
    assert _scene_weight("reference", "writing") == 1.0


@pytest.mark.asyncio
async def test_upsert_memory_sets_memory_kind_and_default_project_ttl(monkeypatch):
    user_id = uuid.uuid4()
    db = _FakeAsyncSession(execute_side_effect=[_ScalarResult(scalar=None)])

    async def _fake_embed_query(_text: str) -> list[float]:
        return [0.1, 0.2, 0.3]

    monkeypatch.setattr("app.providers.embedding.embed_query", _fake_embed_query)

    await _upsert_memory(
        db,
        user_id,
        "current_research_topic",
        "Agent runtime refactor",
        0.9,
        "fact",
        ttl_days=None,
    )
    memory = db.added[0]

    assert memory.memory_kind == "project_state"
    assert memory.expires_at is not None
    ttl_days = (memory.expires_at - datetime.now(timezone.utc)).days
    assert 19 <= ttl_days <= 21


@pytest.mark.asyncio
async def test_upsert_memory_keeps_reference_memories_evergreen(monkeypatch):
    user_id = uuid.uuid4()
    db = _FakeAsyncSession(execute_side_effect=[_ScalarResult(scalar=None)])

    async def _fake_embed_query(_text: str) -> list[float]:
        return [0.1, 0.2, 0.3]

    monkeypatch.setattr("app.providers.embedding.embed_query", _fake_embed_query)

    await _upsert_memory(
        db,
        user_id,
        "project_docs_url",
        "https://example.com/spec",
        0.85,
        "fact",
        ttl_days=None,
    )
    memory = db.added[0]

    assert memory.memory_kind == "reference"
    assert memory.expires_at is None


@pytest.mark.asyncio
async def test_build_memory_context_returns_memory_kind(monkeypatch):
    user_id = uuid.uuid4()

    async def _fake_embed_query(_text: str) -> list[float]:
        return [0.4, 0.2, 0.1]

    monkeypatch.setattr("app.providers.embedding.embed_query", _fake_embed_query)

    now = datetime.now(timezone.utc)
    preference = UserMemory(
        id=uuid.uuid4(),
        user_id=user_id,
        key="writing_style",
        value="简洁直接",
        confidence=0.9,
        memory_type="preference",
        memory_kind="preference",
        access_count=1,
        updated_at=now - timedelta(days=7),
        source="conversation",
        conflict_flag=False,
    )
    project_state = UserMemory(
        id=uuid.uuid4(),
        user_id=user_id,
        key="current_research_topic",
        value="Agent runtime refactor",
        confidence=0.8,
        memory_type="fact",
        memory_kind="project_state",
        access_count=0,
        updated_at=now,
        source="conversation",
        conflict_flag=False,
    )
    db = _FakeAsyncSession(
        execute_side_effect=[
            _ScalarResult(scalars=[preference]),
            RuntimeError("ANN unavailable in unit test"),
            _ScalarResult(scalars=[project_state]),
            _ScalarResult(scalars=[]),
        ]
    )

    context = await build_memory_context(
        user_id,
        "我们现在在做 agent runtime 的哪部分？",
        db,
        top_k=2,
        scene="research",
    )

    assert [item["memory_kind"] for item in context] == ["preference", "project_state"]
    assert context[0]["memory_type"] == "preference"
    assert context[1]["key"] == "current_research_topic"
