from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.desktop_chat_service import DesktopChatService


@pytest.mark.asyncio
async def test_answer_locally_returns_offline_summary_with_citations() -> None:
    service = DesktopChatService(SimpleNamespace(), uuid.uuid4())
    service.knowledge_service.search_local = AsyncMock(  # type: ignore[method-assign]
        return_value={
            "query": "transformer",
            "mode": "fts5",
            "items": [
                {
                    "chunk_id": "chunk-1",
                    "source_id": "source-1",
                    "notebook_id": "notebook-1",
                    "source_title": "Attention Is All You Need",
                    "source_type": "pdf",
                    "chunk_index": 0,
                    "content": "Transformer attention replaces recurrence in sequence modeling.",
                    "excerpt": "Transformer attention replaces recurrence in sequence modeling.",
                    "rank": 0.12,
                    "metadata": {"page": 3, "section": "Architecture"},
                }
            ],
        }
    )

    result = await service.answer_locally(query="transformer")

    assert result["mode"] == "offline_cache"
    assert "Attention Is All You Need" in result["answer"]
    assert "第3页" in result["answer"]
    assert result["citations"] == [
        {
            "source_id": "source-1",
            "chunk_id": "chunk-1",
            "source_title": "Attention Is All You Need",
            "excerpt": "Transformer attention replaces recurrence in sequence modeling.",
            "metadata": {"page": 3, "section": "Architecture"},
        }
    ]


@pytest.mark.asyncio
async def test_answer_locally_returns_empty_state_copy_when_no_hits() -> None:
    service = DesktopChatService(SimpleNamespace(), uuid.uuid4())
    service.knowledge_service.search_local = AsyncMock(  # type: ignore[method-assign]
        return_value={"query": "unknown", "mode": "fts5", "items": []}
    )

    result = await service.answer_locally(query="unknown")

    assert result["mode"] == "offline_cache"
    assert result["citations"] == []
    assert "没有在本地知识库里找到" in result["answer"]
