from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.desktop_knowledge_service import DesktopKnowledgeService
from app.services.desktop_runtime_service import desktop_state_store


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _ChunkResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return self._items


@pytest.fixture(autouse=True)
def desktop_state_env(monkeypatch, tmp_path):
    monkeypatch.setattr("app.config.settings.runtime_profile", "desktop")
    monkeypatch.setattr(
        "app.config.settings.desktop_state_dir_override",
        str(tmp_path / "desktop-state"),
    )
    yield


@pytest.mark.asyncio
async def test_sync_source_chunks_populates_local_search_index() -> None:
    user_id = uuid.uuid4()
    source_id = uuid.uuid4()
    notebook_id = uuid.uuid4()
    source = SimpleNamespace(
        id=source_id,
        notebook_id=notebook_id,
        title="Attention Is All You Need",
        type="pdf",
    )
    chunk = SimpleNamespace(
        id=uuid.uuid4(),
        chunk_index=0,
        content="Transformer attention replaces recurrence in sequence modeling.",
        metadata_={"page": 3, "section": "Architecture"},
    )
    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _ScalarResult(source),
                _ChunkResult([chunk]),
            ]
        )
    )
    service = DesktopKnowledgeService(db, user_id)

    synced = await service.sync_source_chunks(source_id)
    assert synced == 1

    items = desktop_state_store.search_local_chunks(
        user_id=str(user_id),
        query="Transformer attention",
        limit=5,
    )
    assert len(items) == 1
    assert items[0]["source_title"] == "Attention Is All You Need"
    assert items[0]["metadata"] == {"page": 3, "section": "Architecture"}


@pytest.mark.asyncio
async def test_search_local_falls_back_to_like_for_chinese_query(monkeypatch) -> None:
    user_id = uuid.uuid4()
    source_id = uuid.uuid4()
    notebook_id = uuid.uuid4()
    desktop_state_store.sync_source_chunks(
        user_id=str(user_id),
        source_id=str(source_id),
        notebook_id=str(notebook_id),
        source_title="深度学习笔记",
        source_type="md",
        chunks=[
            {
                "chunk_id": str(uuid.uuid4()),
                "chunk_index": 0,
                "content": "这段内容介绍深度学习模型的训练方法与参数更新。",
                "metadata": {"section": "训练"},
            }
        ],
    )

    service = DesktopKnowledgeService(object(), user_id)
    monkeypatch.setattr(service, "ensure_local_index_warmed", AsyncMock(return_value=0))

    result = await service.search_local(query="深度学习", limit=5)

    assert result["mode"] == "fts5"
    assert len(result["items"]) == 1
    assert result["items"][0]["source_title"] == "深度学习笔记"
    assert "深度学习" in result["items"][0]["excerpt"]
