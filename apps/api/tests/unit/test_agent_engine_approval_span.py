"""
P8: OTel span hierarchy — tool.blocked_on_user span tests.

Verifies that _exec_request_approval records a tool.blocked_on_user span
and a tool.approval_result span, capturing how long the agent was blocked.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.agents.core.engine import AgentEngine
from app.agents.core.instructions import RequestHumanApprovalInstruction
from app.agents.core.state import AgentState
from app.agents.core.tools import ToolContext


def _make_engine(db=None) -> AgentEngine:
    return AgentEngine(
        brain=None,  # type: ignore[arg-type]
        tool_ctx=ToolContext(
            notebook_id=None,
            user_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            db=db,
        ),
        tool_schemas=[],
        thought_labels={},
    )


@pytest.mark.asyncio
async def test_request_approval_records_blocked_on_user_span(monkeypatch) -> None:
    """Approval rejection records tool.blocked_on_user and tool.approval_result spans."""
    recorded_spans: list[str] = []

    class _FakeSpanCtx:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *_):
            return False

    def _fake_traced_span(db, span_name, **kwargs):
        recorded_spans.append(("traced_span", span_name, None))
        return _FakeSpanCtx()

    async def _fake_record_completed_span(db, span_name, **kwargs):
        recorded_spans.append(("completed_span", span_name, kwargs.get("status", "?")))

    monkeypatch.setattr("app.agents.core.engine.traced_span", _fake_traced_span)
    monkeypatch.setattr("app.agents.core.engine.record_completed_span", _fake_record_completed_span)

    # Patch approval_store to immediately resolve with rejected
    fake_event = type("FakeEvent", (), {})()
    async def _fake_wait():
        return True

    with patch("app.agents.core.engine.asyncio.wait_for", new=AsyncMock(side_effect=None)):
        # Simulate instant resolution: skip the event wait
        with patch("app.agents.core.approval_store.create", return_value=None), \
             patch("app.agents.core.approval_store.get_result", return_value=False), \
             patch("app.agents.core.approval_store.cleanup", return_value=None), \
             patch("app.agents.core.approval_store._events", {}):

            engine = _make_engine()
            state = AgentState(
                messages=[{"role": "user", "content": "test"}],
                phase="llm_result",
            )
            instruction = RequestHumanApprovalInstruction(
                tool_calls=[{"id": "tc1", "name": "delete_note", "arguments": {}}],
                approval_id="test-approval-123",
            )

            events = [e async for e in engine._exec_request_approval(instruction, state)]

    # Should have emitted human_approve_required first
    assert any(e.get("type") == "human_approve_required" for e in events)

    # tool.blocked_on_user should be in traced_span calls
    traced_names = [name for kind, name, _ in recorded_spans if kind == "traced_span"]
    assert "tool.blocked_on_user" in traced_names

    # tool.approval_result should be in completed_span calls
    completed = [(name, status) for kind, name, status in recorded_spans if kind == "completed_span"]
    assert any(name == "tool.approval_result" for name, _ in completed)


@pytest.mark.asyncio
async def test_request_approval_approved_sets_pending_tool_calls(monkeypatch) -> None:
    """When approved, pending_tool_calls are set and phase → llm_result."""
    class _FakeSpanCtx:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *_):
            return False

    monkeypatch.setattr("app.agents.core.engine.traced_span", lambda *a, **kw: _FakeSpanCtx())
    monkeypatch.setattr("app.agents.core.engine.record_completed_span", AsyncMock())

    tool_calls = [{"id": "tc1", "name": "safe_tool", "arguments": {}}]

    with patch("app.agents.core.approval_store.create", return_value=None), \
         patch("app.agents.core.approval_store.get_result", return_value=True), \
         patch("app.agents.core.approval_store.cleanup", return_value=None), \
         patch("app.agents.core.approval_store._events", {}), \
         patch("app.agents.core.engine.asyncio.wait_for", new=AsyncMock(return_value=None)):

        engine = _make_engine()
        state = AgentState(messages=[], phase="llm_result")
        instruction = RequestHumanApprovalInstruction(
            tool_calls=tool_calls,
            approval_id="test-approval-456",
        )
        _ = [e async for e in engine._exec_request_approval(instruction, state)]

    assert state.pending_tool_calls == tool_calls
    assert state.phase == "llm_result"
    assert "tc1" in state.approved_tool_call_ids
