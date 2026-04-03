from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.agents.core.engine import AgentEngine
from app.agents.core.instructions import CallRAGInstruction
from app.agents.core.state import AgentState
from app.agents.core.tools import ToolContext
from app.models import ObservabilitySpan
from app.services.monitoring_service import create_observability_run
from app.trace import bind_trace_context


@pytest.mark.asyncio
async def test_exec_call_rag_records_separate_rag_and_graph_spans(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_retrieve_chunks(*args, **kwargs):
        return [
            {
                "source_id": str(uuid.uuid4()),
                "chunk_id": str(uuid.uuid4()),
                "excerpt": "rag excerpt",
                "source_title": "Test Source",
                "score": 0.92,
                "content": "rag content",
            }
        ]

    async def fake_graph_augmented_context(*args, **kwargs):
        return "graph context"

    monkeypatch.setattr(
        "app.agents.rag.retrieval.retrieve_chunks",
        fake_retrieve_chunks,
    )
    monkeypatch.setattr(
        "app.agents.rag.graph_retrieval.graph_augmented_context",
        fake_graph_augmented_context,
    )

    trace_id = "trace-rag-split"
    run = await create_observability_run(
        db_session,
        trace_id=trace_id,
        run_type="chat_generation",
        name="chat.generation",
        metadata={"scene": "chat"},
    )
    await db_session.commit()

    engine = AgentEngine(
        brain=None,  # type: ignore[arg-type]
        tool_ctx=ToolContext(
            notebook_id=None,
            user_id=uuid.uuid4(),
            db=db_session,
        ),
        tool_schemas=[],
        thought_labels={},
    )
    state = AgentState(messages=[])

    with bind_trace_context(trace_id, run_id=str(run.id)):
        events = [event async for event in engine._exec_call_rag(CallRAGInstruction(query="hello"), state)]

    assert events == []
    assert state.phase == "rag_done"
    assert state.tool_results == ["graph context", "rag content"]
    assert len(state.citations) == 1

    result = await db_session.execute(
        select(ObservabilitySpan)
        .where(ObservabilitySpan.trace_id == trace_id)
        .order_by(ObservabilitySpan.started_at.asc())
    )
    spans = list(result.scalars().all())

    assert [span.span_name for span in spans] == [
        "chat.rag.retrieve",
        "chat.graph.retrieve",
    ]
    assert all(span.status == "success" for span in spans)
