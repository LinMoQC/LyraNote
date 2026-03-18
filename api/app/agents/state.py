"""
AgentState — immutable-ish data carrier for the Agent execution loop.

Inspired by LobeHub's AgentState design: the state is a plain dataclass
passed between Brain (decision) and Engine (execution) with no methods
of its own.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentState:
    """All mutable state for one agent invocation."""

    messages: list[dict]
    phase: str = "init"
    step_count: int = 0
    max_steps: int = 5

    citations: list[dict] = field(default_factory=list)
    pending_tool_calls: list[dict] = field(default_factory=list)
    tool_results: list[str] = field(default_factory=list)

    mind_map_data: Any = None
    created_note_id: str | None = None
    created_note_title: str | None = None

    force_finish: bool = False

    query: str = ""
    global_search: bool = False
    context_compressed: bool = False

    def estimate_tokens(self) -> int:
        """Rough token count estimate (1 token ≈ 2 CJK chars or 4 Latin chars)."""
        total_chars = sum(
            len(str(m.get("content", ""))) for m in self.messages
        )
        return total_chars // 3
