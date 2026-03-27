"""compose_answer: extra_graph_context is merged into the RAG context message."""

from __future__ import annotations

import pytest

from app.agents.writing.composer import compose_answer


@pytest.mark.asyncio
async def test_compose_answer_prepends_graph_section(monkeypatch):
    captured: dict = {}

    async def fake_chat(messages):
        captured["messages"] = messages
        return "assistant reply"

    monkeypatch.setattr("app.providers.llm.chat", fake_chat)

    chunks = [
        {
            "chunk_id": "c1",
            "source_id": "s1",
            "source_title": "Doc",
            "excerpt": "ex",
            "content": "chunk body",
            "score": 0.9,
        }
    ]

    await compose_answer(
        "user question",
        chunks,
        [],
        extra_graph_context="Entity A --rel--> Entity B",
    )

    ref_msg = next(
        m for m in captured["messages"] if m.get("role") == "user" and "参考资料" in m["content"]
    )
    assert "结构化知识关联（图谱）" in ref_msg["content"]
    assert "Entity A --rel--> Entity B" in ref_msg["content"]
    assert "chunk body" in ref_msg["content"]
