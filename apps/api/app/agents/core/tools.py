"""
Tool registry shim for the ReAct Agent.

This module now acts as a thin wrapper around the SkillRegistry.
ToolContext is defined here because it is shared across the agent pipeline.

Actual tool logic lives in app/skills/builtin/*.py
MCP tools are loaded dynamically per-request in react_agent.py and stored
in ToolContext.mcp_skill_map for execution dispatch.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Tool context (shared state across tool calls in one agent turn)
# ---------------------------------------------------------------------------

@dataclass
class ToolContext:
    notebook_id: str
    user_id: UUID
    db: AsyncSession
    collected_citations: list[dict] = field(default_factory=list)
    global_search: bool = False        # True when called from global chat
    history: list[dict] = field(default_factory=list)  # Recent chat turns for coreference resolution
    mind_map_data: dict | None = None  # Set by generate_mind_map skill
    diagram_data: dict | None = None   # Set by generate_diagram skill
    created_note_id: str | None = None       # Set by create_note_draft skill
    created_note_title: str | None = None    # Set by create_note_draft skill
    ui_elements: list[dict] = field(default_factory=list)  # Flushed to SSE after each tool_result
    # MCPSkill instances keyed by their namespaced function name, populated by react_agent
    mcp_skill_map: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Shim: delegate TOOL_SCHEMAS and execute_tool to SkillRegistry
#
# These exist for backward compatibility with code that still imports them.
# react_agent.py now fetches schemas dynamically; this fallback is kept for
# any code paths that haven't been migrated yet.
# ---------------------------------------------------------------------------

def _get_fallback_schemas() -> list[dict]:
    """Return schemas from all registered skills (no DB filtering)."""
    from app.skills.registry import skill_registry
    return [s.get_schema() for s in skill_registry.all_skills() if s.passes_gating()]


# Legacy static-like access — populated lazily at first access
_CACHED_SCHEMAS: list[dict] | None = None


@property  # type: ignore[misc]
def TOOL_SCHEMAS() -> list[dict]:  # noqa: N802
    global _CACHED_SCHEMAS
    if _CACHED_SCHEMAS is None:
        _CACHED_SCHEMAS = _get_fallback_schemas()
    return _CACHED_SCHEMAS


async def execute_tool(tool_call: dict, ctx: ToolContext) -> str:
    """
    Dispatch a tool_call dict {name, arguments} to the appropriate handler.

    Resolution order:
      1. ctx.mcp_skill_map  — MCP tools loaded for this specific agent turn
      2. skill_registry     — built-in and user-installed Python skills
    """
    from app.skills.registry import skill_registry
    name = tool_call["name"]
    args = tool_call.get("arguments", {})

    # Check MCP skills first (they have namespaced names like "server__tool")
    if name in ctx.mcp_skill_map:
        return await ctx.mcp_skill_map[name].execute(args, ctx)

    return await skill_registry.execute(name, args, ctx)
