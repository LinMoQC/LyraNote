"""
MCPSkill — wraps a single MCP tool as a SkillBase-compatible object.

Each MCPSkill instance represents one tool discovered from an MCP server.
It bridges MCP's JSON Schema–based tool description to the OpenAI
function-calling format that AgentEngine expects.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.skills.base import SkillBase, SkillMeta

if TYPE_CHECKING:
    from app.agents.core.tools import ToolContext
    from app.models import MCPServerConfig


class MCPSkill(SkillBase):
    """
    A callable tool backed by an external MCP server.

    Instances are created dynamically at agent run-time — one per tool
    discovered from an enabled MCP server — and are NOT registered in the
    global SkillRegistry.  They are injected directly into react_agent's
    tool_schemas and resolved via ToolContext.mcp_skills.
    """

    def __init__(
        self,
        server_config: "MCPServerConfig",
        tool_info: dict[str, Any],
    ) -> None:
        self._server_config = server_config
        self._tool_info = tool_info

        # Build a unique function name: "<server_name>__<tool_name>"
        # Uses double-underscore to avoid clashes with builtin skill names.
        safe_server = server_config.name.replace("-", "_").replace(" ", "_")
        safe_tool = tool_info["name"].replace("-", "_").replace(" ", "_")
        self._fn_name = f"{safe_server}__{safe_tool}"

        self.meta = SkillMeta(
            name=self._fn_name,
            display_name=f"{server_config.display_name or server_config.name} / {tool_info['name']}",
            description=tool_info.get("description") or "",
            category="mcp",
            thought_label=f"⚡ {server_config.display_name or server_config.name}: {tool_info['name']}",
        )

    def _build_schema(self, config: dict) -> dict:
        """Convert MCP inputSchema to the flat function-calling dict used by LyraNote skills."""
        input_schema = self._tool_info.get("inputSchema") or {}
        parameters: dict = {
            "type": "object",
            "properties": input_schema.get("properties") or {},
        }
        if "required" in input_schema:
            parameters["required"] = input_schema["required"]

        return {
            "name": self._fn_name,
            "description": self._tool_info.get("description") or "",
            "parameters": parameters,
        }

    async def execute(self, args: dict, ctx: "ToolContext") -> str:
        from app.mcp.client import mcp_client_manager

        return await mcp_client_manager.call_tool(
            self._server_config,
            self._tool_info["name"],  # original MCP tool name, not the namespaced fn_name
            args,
        )

    @property
    def is_markdown_skill(self) -> bool:
        return False


async def load_mcp_skills(user_id, db) -> list[MCPSkill]:
    """
    Query the DB for all enabled MCP server configs belonging to *user_id*,
    connect to each server, discover its tools, and return a list of MCPSkill
    instances ready to be injected into the agent's tool list.

    Errors from individual servers are caught and logged so that a failing
    server does not prevent the agent from starting.
    """
    import logging
    from sqlalchemy import select
    from app.models import MCPServerConfig
    from app.mcp.client import mcp_client_manager

    logger = logging.getLogger(__name__)
    skills: list[MCPSkill] = []

    try:
        stmt = select(MCPServerConfig).where(
            MCPServerConfig.user_id == user_id,
            MCPServerConfig.is_enabled.is_(True),
        )
        result = await db.execute(stmt)
        configs = result.scalars().all()
    except Exception:
        logger.warning("Failed to query MCP server configs", exc_info=True)
        return []

    for config in configs:
        try:
            tools = await mcp_client_manager.get_tools(config)
            for tool_info in tools:
                skills.append(MCPSkill(config, tool_info))

            # Update the discovered_tools cache in DB (fire-and-forget style)
            if tools:
                from datetime import datetime, timezone
                config.discovered_tools = [
                    {"name": t["name"], "description": t.get("description") or ""}
                    for t in tools
                ]
                config.tools_discovered_at = datetime.now(timezone.utc)
                # Flush without blocking the agent if commit fails
                try:
                    await db.commit()
                except Exception:
                    await db.rollback()

            if tools:
                logger.debug(
                    "MCP server '%s' provided %d tool(s)", config.name, len(tools)
                )
        except Exception:
            logger.warning(
                "Failed to load tools from MCP server '%s'", config.name, exc_info=True
            )

    return skills
