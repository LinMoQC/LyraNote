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
    terminal_tool_called: bool = False  # Set by tools that produce self-contained UI (diagram, etc.)
    needs_verification: bool = False
    verification_done: bool = False
    verification_reason: str = ""

    query: str = ""
    global_search: bool = False
    context_compressed: bool = False

    # Cache tool results by (tool_name, args_json) to prevent redundant re-calls.
    tool_result_cache: dict[str, str] = field(default_factory=dict)

    # Track tool call IDs that have already received user approval this session.
    # Brain uses this to avoid re-requesting approval for the same tool calls.
    approved_tool_call_ids: set[str] = field(default_factory=set)

    def tool_cache_key(self, tool_name: str, args: dict) -> str:
        import json
        return f"{tool_name}::{json.dumps(args, sort_keys=True, ensure_ascii=False)}"

    def is_tool_cached(self, tool_name: str, args: dict) -> bool:
        return self.tool_cache_key(tool_name, args) in self.tool_result_cache

    def estimate_tokens(self) -> int:
        """Rough token count estimate (1 token ≈ 2 CJK chars or 4 Latin chars)."""
        total_chars = sum(
            len(str(m.get("content", ""))) for m in self.messages
        )
        return total_chars // 3
