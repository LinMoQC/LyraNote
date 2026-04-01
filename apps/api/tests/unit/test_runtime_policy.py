from __future__ import annotations

from app.agents.core.policy import (
    build_clarification_prompt,
    classify_execution_path,
    context_budget_for_scene,
    needs_clarification,
)


def test_context_budget_for_scene_uses_review_budget() -> None:
    assert context_budget_for_scene("review") == 3500


def test_needs_clarification_for_very_short_query() -> None:
    assert needs_clarification("这个呢") is True


def test_classify_execution_path_prefers_tool_use_for_visualization() -> None:
    decision = classify_execution_path(
        query="帮我画一个思维导图",
        active_scene="research",
        is_visualization_query=True,
    )

    assert decision.execution_path == "tool_use"
    assert decision.reason == "visualization_requires_tool_path"


def test_classify_execution_path_prefers_rag_for_learning_scene() -> None:
    decision = classify_execution_path(
        query="解释一下 RAG 里的 rerank 是什么",
        active_scene="learning",
    )

    assert decision.execution_path == "rag"
    assert decision.reason == "learning_scene_prefers_grounding"


def test_classify_execution_path_returns_clarify_for_ambiguous_query() -> None:
    decision = classify_execution_path(
        query="继续",
        active_scene="research",
    )

    assert decision.execution_path == "clarify"
    assert decision.reason == "query_is_too_ambiguous"


def test_build_clarification_prompt_varies_by_scene() -> None:
    assert "改写" in build_clarification_prompt("继续", "writing")
    assert "快速确认" in build_clarification_prompt("继续", "review")
