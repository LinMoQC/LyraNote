from __future__ import annotations

from app.agents.core.brain import AgentBrain
from app.agents.core.instructions import CallLLMInstruction, ClarifyInstruction
from app.agents.core.policy import build_clarification_prompt, context_budget_for_scene
from app.agents.core.state import AgentState


def test_context_budget_for_scene_uses_review_budget() -> None:
    assert context_budget_for_scene("review") == 3500


def test_context_budget_for_scene_falls_back_to_chat() -> None:
    assert context_budget_for_scene("unknown_scene") == 5000


def test_build_clarification_prompt_varies_by_scene() -> None:
    assert "改写" in build_clarification_prompt("继续", "writing")
    assert "快速确认" in build_clarification_prompt("继续", "review")


# ---------------------------------------------------------------------------
# Brain must NOT emit ClarifyInstruction for short/conversational queries.
# The model decides how to respond — the Brain never inserts a clarify gate.
# ---------------------------------------------------------------------------

def test_brain_never_emits_clarify_for_short_query() -> None:
    """Single-word queries must never be intercepted by the Brain."""
    brain = AgentBrain(has_tools=True, max_steps=5)
    state = AgentState(
        messages=[{"role": "user", "content": "你好"}],
        phase="init",
        query="你好",
    )
    instruction = brain.decide(state)
    assert not isinstance(instruction, ClarifyInstruction)
    assert isinstance(instruction, CallLLMInstruction)


def test_brain_never_emits_clarify_for_followup_phrase() -> None:
    """Common follow-up phrases must proceed to LLM, not get a canned clarify."""
    brain = AgentBrain(has_tools=True, max_steps=5)
    for phrase in ("继续", "你是谁", "谢谢", "好的"):
        state = AgentState(
            messages=[{"role": "user", "content": phrase}],
            phase="init",
            query=phrase,
        )
        instruction = brain.decide(state)
        assert not isinstance(instruction, ClarifyInstruction), (
            f"Brain incorrectly emitted ClarifyInstruction for phrase: {phrase!r}"
        )
