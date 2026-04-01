"""
Tests for app/agents/state.py and app/agents/instructions.py

Both modules are pure Python dataclasses — no IO, no async, tested with
plain pytest assertions.
"""

from __future__ import annotations

import pytest

from app.agents.core.instructions import (
    CallLLMInstruction,
    CallRAGInstruction,
    CallToolsInstruction,
    ClarifyInstruction,
    CompressContextInstruction,
    FinishInstruction,
    RequestHumanApprovalInstruction,
    StreamAnswerInstruction,
)
from app.agents.core.state import AgentState


# ── AgentState ────────────────────────────────────────────────────────────────

class TestAgentStateDefaults:
    def test_phase_default(self):
        state = AgentState(messages=[])
        assert state.phase == "init"

    def test_step_count_default(self):
        state = AgentState(messages=[])
        assert state.step_count == 0

    def test_max_steps_default(self):
        state = AgentState(messages=[])
        assert state.max_steps == 5

    def test_citations_default_empty(self):
        state = AgentState(messages=[])
        assert state.citations == []

    def test_pending_tool_calls_default_empty(self):
        state = AgentState(messages=[])
        assert state.pending_tool_calls == []

    def test_tool_results_default_empty(self):
        state = AgentState(messages=[])
        assert state.tool_results == []

    def test_mind_map_data_default_none(self):
        state = AgentState(messages=[])
        assert state.mind_map_data is None

    def test_created_note_id_default_none(self):
        state = AgentState(messages=[])
        assert state.created_note_id is None

    def test_created_note_title_default_none(self):
        state = AgentState(messages=[])
        assert state.created_note_title is None

    def test_force_finish_default_false(self):
        state = AgentState(messages=[])
        assert state.force_finish is False

    def test_query_default_empty_string(self):
        state = AgentState(messages=[])
        assert state.query == ""

    def test_global_search_default_false(self):
        state = AgentState(messages=[])
        assert state.global_search is False

    def test_active_scene_default_research(self):
        state = AgentState(messages=[])
        assert state.active_scene == "research"

    def test_execution_path_default_direct_answer(self):
        state = AgentState(messages=[])
        assert state.execution_path == "direct_answer"

    def test_context_compressed_default_false(self):
        state = AgentState(messages=[])
        assert state.context_compressed is False

    def test_context_budget_default(self):
        state = AgentState(messages=[])
        assert state.context_budget_chars == 6000

    def test_policy_trace_default_empty(self):
        state = AgentState(messages=[])
        assert state.policy_trace == []


class TestAgentStateConstruction:
    def test_messages_assigned_correctly(self):
        msgs = [{"role": "user", "content": "Hello"}]
        state = AgentState(messages=msgs)
        assert state.messages == msgs

    def test_phase_overrideable(self):
        state = AgentState(messages=[], phase="tool_result")
        assert state.phase == "tool_result"

    def test_all_fields_settable(self):
        state = AgentState(
            messages=[],
            phase="rag_done",
            step_count=3,
            max_steps=10,
            query="test query",
            global_search=True,
            context_compressed=True,
            force_finish=True,
        )
        assert state.phase == "rag_done"
        assert state.step_count == 3
        assert state.max_steps == 10
        assert state.query == "test query"
        assert state.global_search is True
        assert state.context_compressed is True
        assert state.force_finish is True

    def test_mutable_defaults_are_independent(self):
        """Each state instance has its own list instances (not shared)."""
        state1 = AgentState(messages=[])
        state2 = AgentState(messages=[])
        state1.citations.append({"source_id": "a"})
        assert state2.citations == []

    def test_tool_results_independent(self):
        state1 = AgentState(messages=[])
        state2 = AgentState(messages=[])
        state1.tool_results.append("result")
        assert state2.tool_results == []


class TestAgentStateEstimateTokens:
    def test_empty_messages_returns_zero(self):
        state = AgentState(messages=[])
        assert state.estimate_tokens() == 0

    def test_single_message_with_content(self):
        # content = "abc" → 3 chars → 3 // 3 = 1 token
        state = AgentState(messages=[{"role": "user", "content": "abc"}])
        assert state.estimate_tokens() == 1

    def test_calculation_floor_division(self):
        # "Hello" = 5 chars → 5 // 3 = 1
        state = AgentState(messages=[{"role": "user", "content": "Hello"}])
        assert state.estimate_tokens() == 1

    def test_two_messages_accumulate(self):
        # "Hello" (5) + " World" (6) = 11 chars → 11 // 3 = 3
        state = AgentState(messages=[
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": " World"},
        ])
        assert state.estimate_tokens() == 3

    def test_message_without_content_key(self):
        # No content key → defaults to "" → 0 chars
        state = AgentState(messages=[{"role": "user"}])
        assert state.estimate_tokens() == 0

    def test_message_with_none_content(self):
        # content=None → str(None) = "None" → 4 chars → 4 // 3 = 1
        state = AgentState(messages=[{"role": "user", "content": None}])
        assert state.estimate_tokens() == 1

    def test_large_message_scales_linearly(self):
        # 300 chars → 300 // 3 = 100 tokens
        state = AgentState(messages=[{"role": "user", "content": "x" * 300}])
        assert state.estimate_tokens() == 100

    def test_multiple_messages_summed(self):
        # 3 messages each with 90 chars = 270 total → 270 // 3 = 90
        msgs = [{"role": "user", "content": "y" * 90} for _ in range(3)]
        state = AgentState(messages=msgs)
        assert state.estimate_tokens() == 90

    def test_cjk_chars_counted(self):
        # CJK chars: "你好世界" = 4 chars → 4 // 3 = 1
        state = AgentState(messages=[{"role": "user", "content": "你好世界"}])
        assert state.estimate_tokens() == 1

    def test_estimate_updates_with_message_addition(self):
        """estimate_tokens() reflects current messages list."""
        state = AgentState(messages=[])
        assert state.estimate_tokens() == 0
        state.messages.append({"role": "user", "content": "x" * 90})
        assert state.estimate_tokens() == 30

    def test_threshold_detection(self):
        """Can detect when over a threshold like CONTEXT_TOKEN_THRESHOLD=8000."""
        from app.agents.core.brain import CONTEXT_TOKEN_THRESHOLD
        # Need 8000 * 3 = 24000 chars to exceed threshold
        large_msg = {"role": "user", "content": "x" * (CONTEXT_TOKEN_THRESHOLD * 3 + 3)}
        state = AgentState(messages=[large_msg])
        assert state.estimate_tokens() > CONTEXT_TOKEN_THRESHOLD


# ── Instruction dataclasses ───────────────────────────────────────────────────

class TestCallLLMInstruction:
    def test_default_type(self):
        instr = CallLLMInstruction()
        assert instr.type == "call_llm"

    def test_is_dataclass(self):
        from dataclasses import fields
        instr = CallLLMInstruction()
        assert len(fields(instr)) == 1
        assert fields(instr)[0].name == "type"


class TestCallToolsInstruction:
    def test_default_type(self):
        instr = CallToolsInstruction()
        assert instr.type == "call_tools"

    def test_default_tool_calls_empty(self):
        instr = CallToolsInstruction()
        assert instr.tool_calls == []

    def test_tool_calls_stored(self):
        calls = [{"id": "tc1", "name": "search", "arguments": {}}]
        instr = CallToolsInstruction(tool_calls=calls)
        assert instr.tool_calls == calls

    def test_tool_calls_default_independent(self):
        """Two instances should not share the same default list."""
        instr1 = CallToolsInstruction()
        instr2 = CallToolsInstruction()
        instr1.tool_calls.append({"id": "tc1"})
        assert instr2.tool_calls == []


class TestCallRAGInstruction:
    def test_default_type(self):
        instr = CallRAGInstruction()
        assert instr.type == "call_rag"

    def test_default_query_empty(self):
        instr = CallRAGInstruction()
        assert instr.query == ""

    def test_query_stored(self):
        instr = CallRAGInstruction(query="What is AI?")
        assert instr.query == "What is AI?"


class TestStreamAnswerInstruction:
    def test_default_type(self):
        instr = StreamAnswerInstruction()
        assert instr.type == "stream_answer"


class TestCompressContextInstruction:
    def test_default_type(self):
        instr = CompressContextInstruction()
        assert instr.type == "compress_context"


class TestClarifyInstruction:
    def test_default_type(self):
        instr = ClarifyInstruction()
        assert instr.type == "clarify"

    def test_reason_stored(self):
        instr = ClarifyInstruction(reason="query_is_too_ambiguous")
        assert instr.reason == "query_is_too_ambiguous"


class TestRequestHumanApprovalInstruction:
    def test_default_type(self):
        instr = RequestHumanApprovalInstruction()
        assert instr.type == "request_human_approve"

    def test_default_tool_calls_empty(self):
        instr = RequestHumanApprovalInstruction()
        assert instr.tool_calls == []

    def test_tool_calls_stored(self):
        calls = [{"id": "tc1", "name": "dangerous", "arguments": {}}]
        instr = RequestHumanApprovalInstruction(tool_calls=calls)
        assert instr.tool_calls == calls


class TestFinishInstruction:
    def test_default_type(self):
        instr = FinishInstruction()
        assert instr.type == "finish"

    def test_default_reason_completed(self):
        instr = FinishInstruction()
        assert instr.reason == "completed"

    def test_custom_reason(self):
        instr = FinishInstruction(reason="error")
        assert instr.reason == "error"

    def test_error_reason_stored(self):
        instr = FinishInstruction(reason="timeout")
        assert instr.reason == "timeout"
