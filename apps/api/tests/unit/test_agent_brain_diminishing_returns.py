"""
P6: Diminishing-returns detection — unit tests.

Verifies that AgentBrain returns StreamAnswerInstruction after
_DIMINISHING_RETURNS_MAX_TURNS consecutive low-output turns.
"""
from __future__ import annotations

from app.agents.core.brain import AgentBrain, _DIMINISHING_RETURNS_MAX_TURNS
from app.agents.core.instructions import CallLLMInstruction, StreamAnswerInstruction
from app.agents.core.state import AgentState


def _state_at_tool_result(consecutive_low: int) -> AgentState:
    state = AgentState(
        messages=[
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "hi"},
        ],
        phase="tool_result",
    )
    state.consecutive_low_output_turns = consecutive_low
    return state


def test_brain_returns_call_llm_below_threshold() -> None:
    brain = AgentBrain(has_tools=True, max_steps=10)
    state = _state_at_tool_result(consecutive_low=_DIMINISHING_RETURNS_MAX_TURNS - 1)

    instruction = brain.decide(state)

    assert isinstance(instruction, CallLLMInstruction)


def test_brain_returns_stream_answer_at_threshold() -> None:
    brain = AgentBrain(has_tools=True, max_steps=10)
    state = _state_at_tool_result(consecutive_low=_DIMINISHING_RETURNS_MAX_TURNS)

    instruction = brain.decide(state)

    assert isinstance(instruction, StreamAnswerInstruction)


def test_brain_records_policy_trace_on_diminishing_returns() -> None:
    brain = AgentBrain(has_tools=True, max_steps=10)
    state = _state_at_tool_result(consecutive_low=_DIMINISHING_RETURNS_MAX_TURNS)

    brain.decide(state)

    events = [t["event"] for t in state.policy_trace]
    assert "diminishing_returns" in events


def test_brain_returns_stream_answer_above_threshold() -> None:
    brain = AgentBrain(has_tools=True, max_steps=10)
    state = _state_at_tool_result(consecutive_low=_DIMINISHING_RETURNS_MAX_TURNS + 5)

    instruction = brain.decide(state)

    assert isinstance(instruction, StreamAnswerInstruction)
