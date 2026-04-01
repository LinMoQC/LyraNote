"""
Runtime policy helpers for the agent runtime.

This module centralises scene-aware path selection, clarification heuristics,
context budgeting, and lightweight observability metadata so both the single-
agent and multi-agent runtimes follow the same policy layer.
"""

from __future__ import annotations

from dataclasses import dataclass

_CONVERSATIONAL_PATTERNS = (
    "你好",
    "hi",
    "hello",
    "谢谢",
    "thanks",
    "好的",
    "ok",
)

_AMBIGUOUS_SHORT_PATTERNS = (
    "这个",
    "这个呢",
    "然后呢",
    "还有呢",
    "怎么说",
    "啥意思",
    "继续",
    "展开",
    "细说",
)


@dataclass(frozen=True)
class RuntimePolicyDecision:
    execution_path: str
    reason: str
    active_scene: str
    context_budget_chars: int


_SCENE_CONTEXT_BUDGETS = {
    "research": 8000,
    "writing": 5000,
    "learning": 5500,
    "review": 3500,
}


def context_budget_for_scene(scene: str) -> int:
    return _SCENE_CONTEXT_BUDGETS.get(scene, _SCENE_CONTEXT_BUDGETS["research"])


def is_conversational_query(query: str) -> bool:
    q = query.strip().lower()
    return any(pattern in q for pattern in _CONVERSATIONAL_PATTERNS)


def needs_clarification(query: str) -> bool:
    q = query.strip().lower()
    if not q:
        return False
    if len(q) <= 4:
        return True
    return any(pattern in q for pattern in _AMBIGUOUS_SHORT_PATTERNS)


def build_clarification_prompt(query: str, scene: str) -> str:
    if scene == "writing":
        return "你想让我帮你改写、续写，还是先帮你整理一个结构？"
    if scene == "review":
        return "你想快速确认哪一条信息？可以补一句更具体的问题。"
    if scene == "learning":
        return "你想先理解概念、看例子，还是对比几个相关点？"
    return "你想让我重点帮你分析哪一部分？可以补充主题、范围或目标。"


def classify_execution_path(
    *,
    query: str,
    active_scene: str,
    tool_hint: str | None = None,
    attachment_ids: list[str] | None = None,
    is_visualization_query: bool = False,
    is_deep_research: bool = False,
) -> RuntimePolicyDecision:
    scene = active_scene or "research"

    if attachment_ids:
        return RuntimePolicyDecision(
            execution_path="tool_use",
            reason="attachments_require_tool_path",
            active_scene=scene,
            context_budget_chars=context_budget_for_scene(scene),
        )

    if tool_hint:
        return RuntimePolicyDecision(
            execution_path="tool_use",
            reason="tool_hint_requires_tool_path",
            active_scene=scene,
            context_budget_chars=context_budget_for_scene(scene),
        )

    if is_visualization_query:
        return RuntimePolicyDecision(
            execution_path="tool_use",
            reason="visualization_requires_tool_path",
            active_scene=scene,
            context_budget_chars=context_budget_for_scene(scene),
        )

    if is_deep_research:
        return RuntimePolicyDecision(
            execution_path="deep_research",
            reason="deep_research_requires_multi_agent",
            active_scene=scene,
            context_budget_chars=context_budget_for_scene("research"),
        )

    if needs_clarification(query):
        return RuntimePolicyDecision(
            execution_path="clarify",
            reason="query_is_too_ambiguous",
            active_scene=scene,
            context_budget_chars=context_budget_for_scene(scene),
        )

    if is_conversational_query(query):
        return RuntimePolicyDecision(
            execution_path="direct_answer",
            reason="conversational_query",
            active_scene=scene,
            context_budget_chars=context_budget_for_scene(scene),
        )

    if scene in {"research", "learning", "review"}:
        return RuntimePolicyDecision(
            execution_path="rag",
            reason=f"{scene}_scene_prefers_grounding",
            active_scene=scene,
            context_budget_chars=context_budget_for_scene(scene),
        )

    return RuntimePolicyDecision(
        execution_path="direct_answer",
        reason="default_direct_answer",
        active_scene=scene,
        context_budget_chars=context_budget_for_scene(scene),
    )
