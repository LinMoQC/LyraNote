"""
Runtime policy helpers — scene configuration only.

Query intent classification has been removed: the LLM decides whether to call
tools, search knowledge, or answer directly.  This module only holds the
scene-specific context budget table and clarification prompt text.
"""

from __future__ import annotations

_SCENE_CONTEXT_BUDGETS = {
    "chat": 5000,
    "research": 8000,
    "writing": 5000,
    "learning": 5500,
    "review": 3500,
}


def context_budget_for_scene(scene: str) -> int:
    return _SCENE_CONTEXT_BUDGETS.get(scene, _SCENE_CONTEXT_BUDGETS["chat"])


def build_clarification_prompt(query: str, scene: str) -> str:
    if scene == "writing":
        return "你想让我帮你改写、续写，还是先帮你整理一个结构？"
    if scene == "review":
        return "你想快速确认哪一条信息？可以补一句更具体的问题。"
    if scene == "learning":
        return "你想先理解概念、看例子，还是对比几个相关点？"
    return "你想让我重点帮你分析哪一部分？可以补充主题、范围或目标。"
