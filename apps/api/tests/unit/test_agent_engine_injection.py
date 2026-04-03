"""
P5: AgentEngine dependency injection — unit tests.

Verifies that AgentEngine can run its full loop with a FakeLLMBackend
injected at construction, without any monkeypatching of import paths.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

import pytest

from app.agents.core.brain import AgentBrain
from app.agents.core.engine import AgentEngine
from app.agents.core.llm_backend import DefaultLLMBackend, LLMBackend
from app.agents.core.state import AgentState
from app.agents.core.tools import ToolContext


# ---------------------------------------------------------------------------
# Fake backend helpers
# ---------------------------------------------------------------------------

class FakeLLMBackend:
    """Controllable LLM backend for unit tests.

    Pass `stream_events` to control what chat_stream_with_tools yields.
    `chat_responses` is a queue of strings returned by sequential `chat` calls.
    """

    def __init__(
        self,
        stream_events: list[dict] | None = None,
        chat_responses: list[str] | None = None,
    ) -> None:
        self._stream_events: list[dict] = stream_events or [
            {"type": "token", "content": "Hello"},
            {"type": "token", "content": " world"},
        ]
        self._chat_responses: list[str] = list(chat_responses or ["compressed summary"])
        self.chat_stream_with_tools_calls: list[tuple] = []
        self.chat_stream_calls: list[tuple] = []
        self.chat_calls: list[tuple] = []

    async def chat_stream_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        temperature: float = 0.2,
        thinking_enabled: bool | None = None,
    ) -> AsyncGenerator[dict, None]:
        self.chat_stream_with_tools_calls.append((messages, tools, temperature, thinking_enabled))
        for event in self._stream_events:
            yield event

    async def chat_stream(
        self,
        messages: list[dict],
        thinking_enabled: bool | None = None,
    ) -> AsyncGenerator[dict, None]:
        self.chat_stream_calls.append((messages, thinking_enabled))
        for event in self._stream_events:
            yield event

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> str:
        self.chat_calls.append((messages, model, temperature, max_tokens))
        if self._chat_responses:
            return self._chat_responses.pop(0)
        return "fallback response"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def _make_engine(
    fake_llm: FakeLLMBackend,
    has_tools: bool = False,
    db=None,
) -> tuple[AgentEngine, AgentState]:
    tool_ctx = ToolContext(
        notebook_id=None,
        user_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        db=db,
    )
    brain = AgentBrain(has_tools=has_tools, max_steps=5)
    engine = AgentEngine(
        brain=brain,
        tool_ctx=tool_ctx,
        tool_schemas=[],
        thought_labels={},
        llm_backend=fake_llm,
    )
    system_msg = {"role": "system", "content": "You are a test assistant."}
    state = AgentState(messages=[system_msg, {"role": "user", "content": "hello"}])
    return engine, state


@pytest.mark.asyncio
async def test_engine_uses_injected_backend_for_token_stream(monkeypatch) -> None:
    """Full loop: injected FakeLLMBackend yields tokens → done, no import patching."""
    # Patch monitoring service to no-ops so we don't need a real DB
    monkeypatch.setattr(
        "app.agents.core.engine.record_completed_llm_call",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "app.agents.core.engine.traced_span",
        lambda *a, **kw: _NullAsyncContext(),
    )

    fake = FakeLLMBackend(stream_events=[
        {"type": "token", "content": "Hello"},
        {"type": "token", "content": " world"},
    ])
    # has_tools=True → brain emits CallLLMInstruction → chat_stream_with_tools
    engine, state = _make_engine(fake, has_tools=True)

    events = [e async for e in engine.run(state)]

    token_events = [e for e in events if e["type"] == "token"]
    assert [e["content"] for e in token_events] == ["Hello", " world"]
    assert state.phase == "done"

    # Confirm FakeLLMBackend was called — no import-path patching involved
    assert len(fake.chat_stream_with_tools_calls) == 1


@pytest.mark.asyncio
async def test_engine_uses_injected_backend_for_tool_call_loop(monkeypatch) -> None:
    """Loop: model requests one tool call, tool returns result, model answers."""
    monkeypatch.setattr(
        "app.agents.core.engine.record_completed_llm_call",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "app.agents.core.engine.record_completed_tool_call",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "app.agents.core.engine.traced_span",
        lambda *a, **kw: _NullAsyncContext(),
    )
    # Patch execute_tool so no real DB/skill lookup happens
    monkeypatch.setattr(
        "app.agents.core.engine.execute_tool",
        AsyncMock(return_value="tool result text"),
    )

    tool_call_event = {
        "type": "tool_calls",
        "calls": [{"id": "tc1", "name": "search_notebook_knowledge", "arguments": {"query": "test"}}],
        "raw_assistant": {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "tc1", "function": {"name": "search_notebook_knowledge", "arguments": "{}"}}],
        },
    }
    answer_events = [
        {"type": "token", "content": "Based on the results, "},
        {"type": "token", "content": "here is the answer."},
    ]

    call_count = 0

    class SequentialFake:
        """First call → tool_call; second call → answer tokens."""

        async def chat_stream_with_tools(self, messages, tools, temperature=0.2, thinking_enabled=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                yield tool_call_event
            else:
                for e in answer_events:
                    yield e

        async def chat_stream(self, messages, thinking_enabled=None):
            for e in answer_events:
                yield e

        async def chat(self, messages, model=None, temperature=0.0, max_tokens=None):
            return "ok"

    engine, state = _make_engine(SequentialFake(), has_tools=True)
    events = [e async for e in engine.run(state)]

    token_events = [e for e in events if e["type"] == "token"]
    content = "".join(e["content"] for e in token_events)
    assert "answer" in content
    assert state.phase == "done"
    assert call_count == 2


@pytest.mark.asyncio
async def test_engine_keeps_transition_tokens_when_tool_call_follows(monkeypatch) -> None:
    """Transition text becomes a thought, but is no longer followed by empty content_replace."""
    monkeypatch.setattr(
        "app.agents.core.engine.record_completed_llm_call",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "app.agents.core.engine.record_completed_tool_call",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "app.agents.core.engine.traced_span",
        lambda *a, **kw: _NullAsyncContext(),
    )
    monkeypatch.setattr(
        "app.agents.core.engine.execute_tool",
        AsyncMock(return_value="tool result text"),
    )

    transition = "我需要联网检索 2024-2025 年 RAG 最新进展。"
    first_pass_events = [
        {"type": "token", "content": transition},
        {
            "type": "tool_calls",
            "calls": [{"id": "tc1", "name": "web_search", "arguments": {"query": "RAG trends"}}],
            "raw_assistant": {
                "role": "assistant",
                "content": transition,
                "tool_calls": [{"id": "tc1", "function": {"name": "web_search", "arguments": "{\"query\":\"RAG trends\"}"}}],
            },
        },
    ]
    answer_events = [
        {"type": "token", "content": "最终回答"},
    ]

    call_count = 0

    class SequentialFake:
        async def chat_stream_with_tools(self, messages, tools, temperature=0.2, thinking_enabled=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                for event in first_pass_events:
                    yield event
            else:
                for event in answer_events:
                    yield event

        async def chat_stream(self, messages, thinking_enabled=None):
            for event in answer_events:
                yield event

        async def chat(self, messages, model=None, temperature=0.0, max_tokens=None):
            return "ok"

    engine, state = _make_engine(SequentialFake(), has_tools=True)
    events = [e async for e in engine.run(state)]

    assert {"type": "thought", "content": transition} in events
    assert not any(e["type"] == "content_replace" and e.get("content", "") == "" for e in events)
    assert state.phase == "done"


@pytest.mark.asyncio
async def test_default_llm_backend_satisfies_protocol() -> None:
    """DefaultLLMBackend satisfies the LLMBackend Protocol (structural check)."""
    backend = DefaultLLMBackend()
    assert isinstance(backend, LLMBackend)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _NullAsyncContext:
    """Async context manager that does nothing — replaces traced_span in tests."""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False
