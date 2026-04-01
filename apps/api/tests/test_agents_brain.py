"""
Tests for app/agents/brain.py

AgentBrain is pure decision logic with no IO — tested with plain pytest assertions
as documented in the module's docstring.
"""

from __future__ import annotations

import pytest

from app.agents.core.brain import (
    CONTEXT_TOKEN_THRESHOLD,
    TOOLS_REQUIRING_APPROVAL,
    AgentBrain,
)
from app.agents.core.instructions import (
    CallLLMInstruction,
    CallRAGInstruction,
    CallToolsInstruction,
    CompressContextInstruction,
    FinishInstruction,
    RequestHumanApprovalInstruction,
    StreamAnswerInstruction,
    VerifyResultInstruction,
)
from app.agents.core.state import AgentState


# ── Helper factory ─────────────────────────────────────────────────────────────

def make_state(**kwargs) -> AgentState:
    """Create a minimal AgentState with sensible defaults."""
    defaults = dict(
        messages=[{"role": "system", "content": "You are helpful."}],
        phase="init",
        query="What is machine learning?",
    )
    defaults.update(kwargs)
    return AgentState(**defaults)


# ── AgentBrain.decide — phase: init ──────────────────────────────────────────

class TestAgentBrainInitPhase:
    def test_init_phase_returns_call_llm(self):
        brain = AgentBrain()
        state = make_state(phase="init")
        result = brain.decide(state)
        assert isinstance(result, CallLLMInstruction)

    def test_init_phase_has_correct_type_field(self):
        brain = AgentBrain()
        state = make_state(phase="init")
        result = brain.decide(state)
        assert result.type == "call_llm"


# ── AgentBrain.decide — phase: llm_result ────────────────────────────────────

class TestAgentBrainLLMResultPhase:
    def test_pending_tool_calls_returns_call_tools(self):
        brain = AgentBrain()
        tool_calls = [{"id": "tc1", "name": "search", "arguments": {}}]
        state = make_state(phase="llm_result", pending_tool_calls=tool_calls)
        result = brain.decide(state)
        assert isinstance(result, CallToolsInstruction)
        assert result.tool_calls == tool_calls

    def test_pending_tool_calls_tool_calls_attached_to_instruction(self):
        brain = AgentBrain()
        tool_calls = [
            {"id": "tc1", "name": "search", "arguments": {"q": "test"}},
            {"id": "tc2", "name": "summarize", "arguments": {}},
        ]
        state = make_state(phase="llm_result", pending_tool_calls=tool_calls)
        result = brain.decide(state)
        assert isinstance(result, CallToolsInstruction)
        assert len(result.tool_calls) == 2

    def test_no_tools_knowledge_query_no_results_returns_rag(self):
        brain = AgentBrain()
        state = make_state(
            phase="llm_result",
            pending_tool_calls=[],
            tool_results=[],
            query="What is deep learning?",
        )
        result = brain.decide(state)
        assert isinstance(result, CallRAGInstruction)
        assert result.query == "What is deep learning?"

    def test_no_tools_knowledge_query_rag_instruction_has_query(self):
        brain = AgentBrain()
        query = "Explain transformer architecture"
        state = make_state(
            phase="llm_result",
            pending_tool_calls=[],
            tool_results=[],
            query=query,
        )
        result = brain.decide(state)
        assert isinstance(result, CallRAGInstruction)
        assert result.query == query

    def test_no_tools_with_existing_tool_results_returns_stream_answer(self):
        """If tool_results already populated, skip RAG and stream directly."""
        brain = AgentBrain()
        state = make_state(
            phase="llm_result",
            pending_tool_calls=[],
            tool_results=["some retrieved content"],
            query="What is deep learning?",
        )
        result = brain.decide(state)
        assert isinstance(result, StreamAnswerInstruction)

    def test_no_tools_conversational_query_returns_stream_answer(self):
        """Short/conversational queries skip RAG."""
        brain = AgentBrain()
        state = make_state(
            phase="llm_result",
            pending_tool_calls=[],
            tool_results=[],
            query="hi",
        )
        result = brain.decide(state)
        assert isinstance(result, StreamAnswerInstruction)

    def test_no_tools_empty_query_returns_stream_answer(self):
        """Empty query is not knowledge-seeking."""
        brain = AgentBrain()
        state = make_state(
            phase="llm_result",
            pending_tool_calls=[],
            tool_results=[],
            query="",
        )
        result = brain.decide(state)
        assert isinstance(result, StreamAnswerInstruction)

    def test_tools_requiring_approval_triggers_approval_instruction(self):
        """If TOOLS_REQUIRING_APPROVAL is non-empty, tool calls matching it get approval."""
        brain = AgentBrain()
        TOOLS_REQUIRING_APPROVAL.add("dangerous_tool")
        try:
            tool_calls = [{"id": "tc1", "name": "dangerous_tool", "arguments": {}}]
            state = make_state(phase="llm_result", pending_tool_calls=tool_calls)
            result = brain.decide(state)
            assert isinstance(result, RequestHumanApprovalInstruction)
            assert result.tool_calls == tool_calls
        finally:
            TOOLS_REQUIRING_APPROVAL.discard("dangerous_tool")

    def test_tools_requiring_approval_non_matching_still_calls_tools(self):
        """Only tools in TOOLS_REQUIRING_APPROVAL trigger approval; others proceed."""
        brain = AgentBrain()
        TOOLS_REQUIRING_APPROVAL.add("dangerous_tool")
        try:
            tool_calls = [{"id": "tc1", "name": "safe_tool", "arguments": {}}]
            state = make_state(phase="llm_result", pending_tool_calls=tool_calls)
            result = brain.decide(state)
            assert isinstance(result, CallToolsInstruction)
        finally:
            TOOLS_REQUIRING_APPROVAL.discard("dangerous_tool")

    def test_mixed_tools_some_requiring_approval(self):
        """If any tool requires approval, the whole set goes through approval."""
        brain = AgentBrain()
        TOOLS_REQUIRING_APPROVAL.add("dangerous_tool")
        try:
            tool_calls = [
                {"id": "tc1", "name": "safe_tool", "arguments": {}},
                {"id": "tc2", "name": "dangerous_tool", "arguments": {}},
            ]
            state = make_state(phase="llm_result", pending_tool_calls=tool_calls)
            result = brain.decide(state)
            assert isinstance(result, RequestHumanApprovalInstruction)
        finally:
            TOOLS_REQUIRING_APPROVAL.discard("dangerous_tool")


# ── AgentBrain.decide — phase: tool_result ────────────────────────────────────

class TestAgentBrainToolResultPhase:
    def test_within_step_limit_returns_call_llm(self):
        brain = AgentBrain(max_steps=5)
        state = make_state(phase="tool_result", step_count=2)
        result = brain.decide(state)
        assert isinstance(result, CallLLMInstruction)

    def test_at_max_steps_returns_stream_answer(self):
        brain = AgentBrain(max_steps=5)
        state = make_state(phase="tool_result", step_count=5)
        result = brain.decide(state)
        assert isinstance(result, StreamAnswerInstruction)

    def test_at_max_steps_sets_force_finish(self):
        brain = AgentBrain(max_steps=5)
        state = make_state(phase="tool_result", step_count=5)
        brain.decide(state)
        assert state.force_finish is True

    def test_exceeding_max_steps_returns_stream_answer(self):
        brain = AgentBrain(max_steps=3)
        state = make_state(phase="tool_result", step_count=10)
        result = brain.decide(state)
        assert isinstance(result, StreamAnswerInstruction)

    def test_custom_max_steps_respected(self):
        brain = AgentBrain(max_steps=10)
        state = make_state(phase="tool_result", step_count=9)
        result = brain.decide(state)
        assert isinstance(result, CallLLMInstruction)

    def test_needs_verification_returns_verify_instruction(self):
        brain = AgentBrain(max_steps=10)
        state = make_state(
            phase="tool_result",
            step_count=1,
            needs_verification=True,
            verification_done=False,
            verification_reason="check citations",
        )
        result = brain.decide(state)
        assert isinstance(result, VerifyResultInstruction)
        assert result.reason == "check citations"

    def test_verification_done_returns_call_llm(self):
        brain = AgentBrain(max_steps=10)
        state = make_state(
            phase="tool_result",
            step_count=1,
            needs_verification=False,
            verification_done=True,
        )
        result = brain.decide(state)
        assert isinstance(result, CallLLMInstruction)

    def test_high_token_count_triggers_compress_context(self):
        """Over CONTEXT_TOKEN_THRESHOLD tokens should trigger compression."""
        brain = AgentBrain(max_steps=5)
        # Craft messages that produce many chars → many tokens
        large_content = "a" * (CONTEXT_TOKEN_THRESHOLD * 3 + 10)
        messages = [{"role": "user", "content": large_content}]
        state = make_state(
            phase="tool_result",
            step_count=1,
            messages=messages,
            context_compressed=False,
        )
        result = brain.decide(state)
        assert isinstance(result, CompressContextInstruction)

    def test_already_compressed_skips_compression(self):
        """Context already compressed → skip compression, go to LLM."""
        brain = AgentBrain(max_steps=5)
        large_content = "a" * (CONTEXT_TOKEN_THRESHOLD * 3 + 10)
        messages = [{"role": "user", "content": large_content}]
        state = make_state(
            phase="tool_result",
            step_count=1,
            messages=messages,
            context_compressed=True,
        )
        result = brain.decide(state)
        assert isinstance(result, CallLLMInstruction)

    def test_low_token_count_returns_call_llm(self):
        brain = AgentBrain(max_steps=5)
        state = make_state(phase="tool_result", step_count=1)
        result = brain.decide(state)
        assert isinstance(result, CallLLMInstruction)


# ── AgentBrain.decide — phase: rag_done ──────────────────────────────────────

class TestAgentBrainRagDonePhase:
    def test_rag_done_returns_stream_answer(self):
        brain = AgentBrain()
        state = make_state(phase="rag_done")
        result = brain.decide(state)
        assert isinstance(result, StreamAnswerInstruction)


# ── AgentBrain.decide — phase: max_steps_fallback ────────────────────────────

class TestAgentBrainMaxStepsFallbackPhase:
    def test_max_steps_fallback_returns_stream_answer(self):
        brain = AgentBrain()
        state = make_state(phase="max_steps_fallback")
        result = brain.decide(state)
        assert isinstance(result, StreamAnswerInstruction)


# ── AgentBrain.decide — unknown phase ────────────────────────────────────────

class TestAgentBrainUnknownPhase:
    def test_unknown_phase_returns_finish_with_error(self):
        brain = AgentBrain()
        state = make_state(phase="unknown_garbage")
        result = brain.decide(state)
        assert isinstance(result, FinishInstruction)
        assert result.reason == "error"

    def test_empty_phase_returns_finish_with_error(self):
        brain = AgentBrain()
        state = make_state(phase="")
        result = brain.decide(state)
        assert isinstance(result, FinishInstruction)
        assert result.reason == "error"

    def test_done_phase_returns_finish_with_error(self):
        """'done' is not handled in decide() — it's an exit condition for Engine."""
        brain = AgentBrain()
        state = make_state(phase="done")
        result = brain.decide(state)
        assert isinstance(result, FinishInstruction)
        assert result.reason == "error"


# ── AgentBrain constructor ────────────────────────────────────────────────────

class TestAgentBrainConstructor:
    def test_default_has_tools_is_true(self):
        brain = AgentBrain()
        assert brain._has_tools is True

    def test_custom_has_tools_false(self):
        brain = AgentBrain(has_tools=False)
        assert brain._has_tools is False

    def test_default_max_steps(self):
        brain = AgentBrain()
        assert brain._max_steps == 5

    def test_custom_max_steps(self):
        brain = AgentBrain(max_steps=10)
        assert brain._max_steps == 10

    def test_zero_max_steps_immediately_forces_stream(self):
        """max_steps=0 should force stream answer on first tool result."""
        brain = AgentBrain(max_steps=0)
        state = make_state(phase="tool_result", step_count=0)
        result = brain.decide(state)
        assert isinstance(result, StreamAnswerInstruction)
        assert state.force_finish is True
