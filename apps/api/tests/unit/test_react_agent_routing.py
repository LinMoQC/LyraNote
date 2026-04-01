from __future__ import annotations

from app.agents.core.react_agent import (
    _is_deep_research,
    _is_visualization_query,
    classify_agent_execution_route,
)


def test_visualization_query_detection_handles_chinese_keyword() -> None:
    assert _is_visualization_query("请帮我生成这份资料的思维导图") is True


def test_visualization_query_detection_handles_english_keyword() -> None:
    assert _is_visualization_query("Please generate a diagram for this system") is True


def test_visualization_query_detection_ignores_plain_question() -> None:
    assert _is_visualization_query("请总结这篇论文的核心贡献") is False


def test_deep_research_detection_handles_chinese_keyword() -> None:
    assert _is_deep_research("请做一次系统性分析") is True


def test_deep_research_detection_handles_english_keyword() -> None:
    assert _is_deep_research("Need a deep research report on this topic") is True


def test_classify_route_prefers_single_for_attachments() -> None:
    route = classify_agent_execution_route(
        query="请做一次深度研究",
        attachment_ids=["att_1"],
    )

    assert route.mode == "single"
    assert route.reason == "attachments_require_single_agent"
    assert route.policy.execution_path == "tool_use"


def test_classify_route_prefers_single_for_tool_hint() -> None:
    route = classify_agent_execution_route(
        query="请做一次深度研究",
        tool_hint="summarize",
    )

    assert route.mode == "single"
    assert route.reason == "tool_hint_requires_single_agent"
    assert route.policy.execution_path == "tool_use"


def test_classify_route_prefers_single_for_visualization() -> None:
    route = classify_agent_execution_route(
        query="请做一个知识图谱并解释关键关系",
    )

    assert route.mode == "single"
    assert route.reason == "visualization_requires_single_agent"
    assert route.policy.execution_path == "tool_use"


def test_classify_route_prefers_multi_for_deep_research() -> None:
    route = classify_agent_execution_route(
        query="请做一次 comprehensive analysis，系统梳理这个方向",
    )

    assert route.mode == "multi"
    assert route.reason == "deep_research_prefers_multi_agent"
    assert route.policy.execution_path == "deep_research"


def test_classify_route_defaults_to_single() -> None:
    route = classify_agent_execution_route(
        query="帮我解释一下这段内容是什么意思",
        active_scene="learning",
    )

    assert route.mode == "single"
    assert route.reason == "default_single_agent"
    assert route.policy.execution_path == "rag"
