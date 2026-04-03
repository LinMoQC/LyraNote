"""
Tool post-processing hook system — inspired by Claude Code's hook middleware.

Each PostToolHook is called after a tool executes.  It inspects the result,
optionally transforms it, and returns any SSE events that should be emitted
to the client.  Hooks run in registration order.

Usage (engine construction):
    engine = AgentEngine(
        ...
        post_tool_hooks=[CustomHook()],  # appended after built-in hooks
    )

Default hooks (registered automatically via _default_post_tool_hooks()):
  MindMapHook       → flushes tool_ctx.mind_map_data → mind_map SSE event
  DiagramHook       → flushes tool_ctx.diagram_data  → diagram SSE event
  McpJsonHook       → parses MCP JSON result         → mcp_result SSE event
  McpActionTerminalHook → marks MCP action tools as terminal
  NoteCreatedHook   → flushes tool_ctx.created_note_id → note_created SSE event
  CitationSummaryHook  → emits citation summary for RAG/web search tools
  UIElementsHook    → flushes tool_ctx.ui_elements   → ui_element SSE events
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from app.agents.core.state import AgentState
    from app.agents.core.tools import ToolContext


@runtime_checkable
class PostToolHook(Protocol):
    """Callable that processes one tool result after execution.

    Args:
        tc:       The tool call dict ({id, name, arguments}).
        result:   The tool's return value string.
        state:    Current agent state (mutable).
        tool_ctx: Tool context (mutable — may contain side-effect data to flush).

    Returns:
        A tuple ``(modified_result, sse_events)``:
          - modified_result: replacement string for ``result``, or ``None`` to keep original.
          - sse_events: list of dicts to emit as SSE events, in order.
    """

    def __call__(
        self,
        tc: dict,
        result: str,
        state: "AgentState",
        tool_ctx: "ToolContext",
    ) -> tuple[str | None, list[dict]]:
        ...


# ---------------------------------------------------------------------------
# Built-in hooks
# ---------------------------------------------------------------------------

class MindMapHook:
    """Flush mind_map_data set by generate_mind_map skill."""

    def __call__(self, tc, result, state, tool_ctx) -> tuple[str | None, list[dict]]:
        if tool_ctx.mind_map_data is None:
            return None, []
        data = tool_ctx.mind_map_data
        tool_ctx.mind_map_data = None
        state.terminal_tool_called = True
        return None, [{"type": "mind_map", "data": data}]


class DiagramHook:
    """Flush diagram_data set by generate_diagram skill."""

    def __call__(self, tc, result, state, tool_ctx) -> tuple[str | None, list[dict]]:
        if tool_ctx.diagram_data is None:
            return None, []
        data = tool_ctx.diagram_data
        tool_ctx.diagram_data = None
        state.terminal_tool_called = True
        return None, [{"type": "diagram", "data": data}]


class McpJsonHook:
    """Parse MCP-namespaced tool results as JSON and forward as mcp_result events."""

    def __call__(self, tc, result, state, tool_ctx) -> tuple[str | None, list[dict]]:
        from app.agents.core.engine import _try_parse_mcp_json

        payload = _try_parse_mcp_json(tc["name"], result)
        if payload is None:
            return None, []
        state.terminal_tool_called = True
        modified_result = f"[工具 {tc['name']} 已执行，返回结构化数据]"
        return modified_result, [{"type": "mcp_result", "data": payload}]


class McpActionTerminalHook:
    """Mark MCP action tools (non-read) as terminal even when result is plain text."""

    _NON_TERMINAL_PREFIXES = ("read", "list", "get", "fetch", "save", "load")

    def __call__(self, tc, result, state, tool_ctx) -> tuple[str | None, list[dict]]:
        if "__" not in tc["name"] or state.terminal_tool_called:
            return None, []
        suffix = tc["name"].rsplit("__", 1)[-1]
        if not any(suffix.startswith(p) for p in self._NON_TERMINAL_PREFIXES):
            state.terminal_tool_called = True
        return None, []


class NoteCreatedHook:
    """Flush created_note_id set by create_note_draft skill."""

    def __call__(self, tc, result, state, tool_ctx) -> tuple[str | None, list[dict]]:
        if tool_ctx.created_note_id is None:
            return None, []
        event = {
            "type": "note_created",
            "note_id": tool_ctx.created_note_id,
            "note_title": tool_ctx.created_note_title,
            "notebook_id": tool_ctx.created_notebook_id or tool_ctx.notebook_id,
        }
        modified_result = result.split(":", 2)[-1] if result.startswith("NOTE_CREATED:") else result
        tool_ctx.created_note_id = None
        tool_ctx.created_note_title = None
        tool_ctx.created_notebook_id = None
        state.terminal_tool_called = True
        return modified_result, [event]


class CitationSummaryHook:
    """Emit a citation summary event for RAG / web search tools."""

    def __call__(self, tc, result, state, tool_ctx) -> tuple[str | None, list[dict]]:
        if tc["name"] == "search_notebook_knowledge" and tool_ctx.collected_citations:
            lines = [
                f"[片段{i}] 来源：《{c['source_title']}》（相关度 {c.get('score', 0):.0%}）"
                for i, c in enumerate(tool_ctx.collected_citations, 1)
            ]
            return None, [{"type": "tool_result", "content": f"✓ 找到 {len(lines)} 个相关片段\n" + "\n".join(lines)}]

        if tc["name"] == "web_search" and tool_ctx.collected_citations:
            web = [c for c in tool_ctx.collected_citations if str(c.get("source_id", "")).startswith("web-search")]
            lines = [
                f"[网络{i}] 《{c['source_title']}》（相关度 {c.get('score', 0):.0%}）"
                for i, c in enumerate(web, 1)
            ]
            return None, [{"type": "tool_result", "content": f"✓ 搜索到 {len(lines)} 条网络结果\n" + "\n".join(lines)}]

        return None, []


class DefaultToolResultHook:
    """Fallback: emit a short preview of the raw result."""

    def __call__(self, tc, result, state, tool_ctx) -> tuple[str | None, list[dict]]:
        # Only fires if none of the above hooks already emitted a tool_result event
        # (CitationSummaryHook handles the search tools — no double-emit here).
        # This hook always runs but emits only the generic preview.
        return None, [{"type": "tool_result", "content": result[:300]}]


class UIElementsHook:
    """Flush generic ui_elements accumulated by skills during execution."""

    def __call__(self, tc, result, state, tool_ctx) -> tuple[str | None, list[dict]]:
        if not tool_ctx.ui_elements:
            return None, []
        events = [{"type": "ui_element", **elem} for elem in tool_ctx.ui_elements]
        tool_ctx.ui_elements.clear()
        return None, events


# ---------------------------------------------------------------------------
# Default hook list
# ---------------------------------------------------------------------------

def default_post_tool_hooks() -> list[PostToolHook]:
    """Return the default ordered list of post-tool hooks."""
    return [
        MindMapHook(),
        DiagramHook(),
        McpJsonHook(),
        McpActionTerminalHook(),
        NoteCreatedHook(),
        CitationSummaryHook(),
        DefaultToolResultHook(),
        UIElementsHook(),
    ]
