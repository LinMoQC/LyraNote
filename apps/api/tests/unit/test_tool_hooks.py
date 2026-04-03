"""
P9: Tool Hook system — unit tests.

Verifies that:
  1. Built-in hooks fire correctly for their respective tool types
  2. Custom hooks can be injected at AgentEngine construction
  3. The engine uses the hook list rather than hardcoded if-elif checks
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from unittest.mock import MagicMock

import pytest

from app.agents.core.hooks import (
    CitationSummaryHook,
    DefaultToolResultHook,
    DiagramHook,
    MindMapHook,
    NoteCreatedHook,
    UIElementsHook,
    default_post_tool_hooks,
)
from app.agents.core.state import AgentState
from app.agents.core.tools import ToolContext


# ---------------------------------------------------------------------------
# Minimal ToolContext factory for unit tests
# ---------------------------------------------------------------------------

def _ctx(**overrides) -> ToolContext:
    base = dict(
        notebook_id="nb-1",
        user_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        db=MagicMock(),
    )
    base.update(overrides)
    return ToolContext(**base)


def _state() -> AgentState:
    return AgentState(messages=[])


def _tc(name: str = "some_tool") -> dict:
    return {"id": "tc1", "name": name, "arguments": {}}


# ---------------------------------------------------------------------------
# MindMapHook
# ---------------------------------------------------------------------------

def test_mind_map_hook_flushes_data() -> None:
    ctx = _ctx()
    ctx.mind_map_data = {"nodes": []}
    state = _state()

    result, events = MindMapHook()(_tc(), "raw", state, ctx)

    assert ctx.mind_map_data is None
    assert state.terminal_tool_called is True
    assert events == [{"type": "mind_map", "data": {"nodes": []}}]
    assert result is None  # no result mutation


def test_mind_map_hook_noop_when_empty() -> None:
    ctx = _ctx()
    state = _state()

    result, events = MindMapHook()(_tc(), "raw", state, ctx)

    assert events == []
    assert state.terminal_tool_called is False


# ---------------------------------------------------------------------------
# DiagramHook
# ---------------------------------------------------------------------------

def test_diagram_hook_flushes_data() -> None:
    ctx = _ctx()
    ctx.diagram_data = {"type": "flowchart"}
    state = _state()

    result, events = DiagramHook()(_tc(), "raw", state, ctx)

    assert ctx.diagram_data is None
    assert state.terminal_tool_called is True
    assert events[0]["type"] == "diagram"


# ---------------------------------------------------------------------------
# NoteCreatedHook
# ---------------------------------------------------------------------------

def test_note_created_hook_strips_prefix() -> None:
    ctx = _ctx()
    ctx.created_note_id = "note-123"
    ctx.created_note_title = "My Note"
    ctx.created_notebook_id = None
    state = _state()

    result, events = NoteCreatedHook()(_tc(), "NOTE_CREATED:extra payload", state, ctx)

    assert ctx.created_note_id is None
    assert state.terminal_tool_called is True
    assert result == "extra payload"
    assert events[0]["type"] == "note_created"
    assert events[0]["note_id"] == "note-123"
    assert events[0]["notebook_id"] == "nb-1"  # falls back to tool_ctx.notebook_id


def test_note_created_hook_noop_when_empty() -> None:
    ctx = _ctx()
    state = _state()

    result, events = NoteCreatedHook()(_tc(), "raw result", state, ctx)

    assert events == []
    assert result is None


# ---------------------------------------------------------------------------
# CitationSummaryHook
# ---------------------------------------------------------------------------

def test_citation_summary_hook_rag_search() -> None:
    ctx = _ctx()
    ctx.collected_citations = [
        {"source_title": "Paper A", "score": 0.9, "source_id": "src-1"},
    ]
    state = _state()

    result, events = CitationSummaryHook()(_tc("search_notebook_knowledge"), "raw", state, ctx)

    assert result is None
    assert len(events) == 1
    assert events[0]["type"] == "tool_result"
    assert "Paper A" in events[0]["content"]
    assert "片段" in events[0]["content"]


def test_citation_summary_hook_web_search() -> None:
    ctx = _ctx()
    ctx.collected_citations = [
        {"source_title": "Blog Post", "score": 0.8, "source_id": "web-search-1"},
    ]
    state = _state()

    result, events = CitationSummaryHook()(_tc("web_search"), "raw", state, ctx)

    assert result is None
    assert "Blog Post" in events[0]["content"]
    assert "网络" in events[0]["content"]


def test_citation_summary_hook_noop_for_other_tools() -> None:
    ctx = _ctx()
    state = _state()

    result, events = CitationSummaryHook()(_tc("create_note_draft"), "raw", state, ctx)

    assert events == []


# ---------------------------------------------------------------------------
# DefaultToolResultHook
# ---------------------------------------------------------------------------

def test_default_result_hook_truncates_long_results() -> None:
    ctx = _ctx()
    state = _state()
    long_result = "x" * 500

    _, events = DefaultToolResultHook()(_tc(), long_result, state, ctx)

    assert events[0]["type"] == "tool_result"
    assert len(events[0]["content"]) <= 300


# ---------------------------------------------------------------------------
# UIElementsHook
# ---------------------------------------------------------------------------

def test_ui_elements_hook_flushes_and_clears() -> None:
    ctx = _ctx()
    ctx.ui_elements = [{"component": "badge", "label": "Done"}]
    state = _state()

    result, events = UIElementsHook()(_tc(), "raw", state, ctx)

    assert ctx.ui_elements == []
    assert events == [{"type": "ui_element", "component": "badge", "label": "Done"}]


# ---------------------------------------------------------------------------
# default_post_tool_hooks ordering
# ---------------------------------------------------------------------------

def test_default_hooks_contains_all_required_types() -> None:
    hooks = default_post_tool_hooks()
    hook_types = {type(h).__name__ for h in hooks}
    assert "MindMapHook" in hook_types
    assert "DiagramHook" in hook_types
    assert "NoteCreatedHook" in hook_types
    assert "CitationSummaryHook" in hook_types
    assert "DefaultToolResultHook" in hook_types
    assert "UIElementsHook" in hook_types


# ---------------------------------------------------------------------------
# Custom hook injection via AgentEngine
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_engine_uses_injected_custom_hook(monkeypatch) -> None:
    """A custom hook injected at construction fires for every tool call."""
    from unittest.mock import AsyncMock
    from app.agents.core.brain import AgentBrain
    from app.agents.core.engine import AgentEngine
    from app.agents.core.tools import ToolContext

    fired_for: list[str] = []

    class RecordingHook:
        def __call__(self, tc, result, state, tool_ctx):
            fired_for.append(tc["name"])
            return None, []

    monkeypatch.setattr("app.agents.core.engine.record_completed_llm_call", AsyncMock())
    monkeypatch.setattr("app.agents.core.engine.record_completed_tool_call", AsyncMock())
    monkeypatch.setattr("app.agents.core.engine.traced_span", lambda *a, **kw: _NullAsyncCtx())
    monkeypatch.setattr(
        "app.agents.core.engine.execute_tool",
        AsyncMock(return_value="tool result"),
    )

    # Inject the recording hook before the default hooks
    engine = AgentEngine(
        brain=AgentBrain(has_tools=True, max_steps=5),
        tool_ctx=ToolContext(
            notebook_id=None,
            user_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            db=MagicMock(),
        ),
        tool_schemas=[],
        thought_labels={},
        post_tool_hooks=[RecordingHook(), *default_post_tool_hooks()],
    )

    from app.agents.core.instructions import CallToolsInstruction
    from app.agents.core.state import AgentState as _AS

    state = _AS(messages=[{"role": "user", "content": "hi"}], phase="llm_result")
    instruction = CallToolsInstruction(
        tool_calls=[{"id": "tc1", "name": "my_tool", "arguments": {}}]
    )

    _ = [e async for e in engine._exec_call_tools(instruction, state)]

    assert "my_tool" in fired_for


class _NullAsyncCtx:
    async def __aenter__(self):
        return self
    async def __aexit__(self, *_):
        return False
