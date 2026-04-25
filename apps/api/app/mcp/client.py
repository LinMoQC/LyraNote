"""
MCP (Model Context Protocol) client layer.

Provides MCPClientManager which can:
  1. List tools exposed by a configured MCP server (get_tools)
  2. Call a specific tool on that server (call_tool)

Supports three MCP transport types:
  - stdio: spawns a local subprocess and communicates via stdin/stdout
  - http:  Streamable HTTP transport (MCP spec 2025, used by most modern remote servers)
            Headers are passed via a pre-configured httpx.AsyncClient.
            Returns (read, write, get_session_id) — third element is discarded.
  - sse:   Legacy SSE transport (older remote servers, kept for compatibility)
            Accepts headers dict directly.
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any, AsyncGenerator

if TYPE_CHECKING:
    from app.models import MCPServerConfig

logger = logging.getLogger(__name__)


def _exc_msg(exc: BaseException) -> str:
    """Flatten a plain exception or a BaseExceptionGroup into a readable string.

    Handles CancelledError (str() == '') and nested exception groups by
    falling back to repr() when str() is empty.
    """
    if isinstance(exc, BaseExceptionGroup):
        parts = [_exc_msg(e) for e in exc.exceptions]
        non_empty = [p for p in parts if p]
        return "; ".join(non_empty) if non_empty else repr(exc)
    msg = str(exc)
    return msg if msg else repr(exc)


class MCPClientManager:
    """
    Stateless manager for MCP server interactions.
    Each method opens a fresh connection, performs the operation, then closes it.
    """

    async def get_tools(self, config: "MCPServerConfig") -> list[dict]:
        """
        Connect to the MCP server, call list_tools(), return tool descriptors.
        Returns an empty list on any connection or protocol error.
        """
        try:
            return await self._run(config, "list_tools")
        except BaseException as exc:
            if isinstance(exc, asyncio.CancelledError):
                raise
            msg = _exc_msg(exc)
            logger.warning("MCP get_tools failed for server '%s': %s", config.name, msg)
            return []

    async def call_tool(
        self,
        config: "MCPServerConfig",
        tool_name: str,
        arguments: dict[str, Any],
    ) -> str:
        """
        Connect to the MCP server, call *tool_name* with *arguments*.
        Returns a string result for the LLM.  Retries once on transient errors.
        """
        last_exc: BaseException | None = None
        for attempt in range(2):
            try:
                return await self._run(config, "call_tool", tool_name=tool_name, arguments=arguments)
            except BaseException as exc:
                if isinstance(exc, asyncio.CancelledError):
                    raise
                last_exc = exc
                if attempt == 0:
                    logger.warning(
                        "MCP tool call attempt 1 failed for %s/%s (%s), retrying…",
                        config.name, tool_name, _exc_msg(exc),
                    )
        raise RuntimeError(
            f"MCP tool call failed ({config.name}/{tool_name}): {_exc_msg(last_exc)}"
        ) from last_exc

    # ------------------------------------------------------------------
    # Core dispatch
    # ------------------------------------------------------------------

    async def _run(self, config: "MCPServerConfig", action: str, **kwargs):
        from mcp import ClientSession

        if config.transport == "http":
            return await self._run_http(config, action, **kwargs)

        # stdio and sse both yield (read, write)
        async with self._legacy_transport(config) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return await self._dispatch(session, action, **kwargs)

    async def _run_http(self, config: "MCPServerConfig", action: str, **kwargs):
        import httpx
        from mcp import ClientSession
        from mcp.client.streamable_http import streamable_http_client

        headers = dict(config.headers or {})
        # Always use an explicit AsyncClient so we control its lifecycle and can
        # set timeouts.  BrokenResourceError was caused by the client not being
        # closed properly when headers={} (falsy → None, no context-manager).
        async with httpx.AsyncClient(
            headers=headers or None,
            timeout=httpx.Timeout(60.0, connect=15.0),
            follow_redirects=True,
        ) as http_client:
            async with streamable_http_client(
                url=config.url or "",
                http_client=http_client,
            ) as (read, write, _get_session_id):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    return await self._dispatch(session, action, **kwargs)

    @staticmethod
    async def _dispatch(session, action: str, **kwargs):
        if action == "list_tools":
            result = await session.list_tools()
            return [MCPClientManager._tool_to_dict(t) for t in result.tools]
        elif action == "call_tool":
            result = await session.call_tool(kwargs["tool_name"], kwargs["arguments"])
            return MCPClientManager._result_to_str(result)
        else:
            raise ValueError(f"Unknown action: {action}")

    def _legacy_transport(self, config: "MCPServerConfig"):
        """Context manager for stdio and sse transports (both yield (read, write))."""
        if config.transport == "stdio":
            return self._stdio_transport(config)
        elif config.transport == "sse":
            return self._sse_transport(config)
        else:
            raise ValueError(f"Unsupported MCP transport: {config.transport!r}")

    def _stdio_transport(self, config: "MCPServerConfig"):
        from mcp.client.stdio import stdio_client, StdioServerParameters

        env: dict[str, str] | None = None
        if config.env_vars:
            env = {**os.environ, **config.env_vars}

        params = StdioServerParameters(
            command=config.command or "",
            args=list(config.args or []),
            env=env,
        )
        return stdio_client(params)

    def _sse_transport(self, config: "MCPServerConfig"):
        from mcp.client.sse import sse_client

        headers = dict(config.headers or {}) or None
        return sse_client(url=config.url or "", headers=headers)

    # ------------------------------------------------------------------
    # Serialization helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _tool_to_dict(tool) -> dict:
        schema: dict = {}
        if tool.inputSchema:
            if hasattr(tool.inputSchema, "model_dump"):
                schema = tool.inputSchema.model_dump(exclude_none=True)
            elif isinstance(tool.inputSchema, dict):
                schema = tool.inputSchema
        return {
            "name": tool.name,
            "description": tool.description or "",
            "inputSchema": schema,
        }

    @staticmethod
    def _result_to_str(result) -> str:
        """Serialize a CallToolResult to a string for the LLM.

        Handles three content types from the MCP spec:
          - TextContent          → plain text (most tools)
          - ImageContent         → [binary data, N bytes]
          - EmbeddedResource     → extracts text/HTML from the resource payload

        When an EmbeddedResource with text/html mime type is found, the HTML is
        embedded as a special sentinel so the engine can later extract and render
        it in an iframe without any tool-specific knowledge.
        """
        if not result.content:
            return ""

        text_parts: list[str] = []
        html_content: str | None = None

        for item in result.content:
            # TextContent
            if hasattr(item, "text") and item.text is not None and not hasattr(item, "resource"):
                text_parts.append(item.text)
                continue

            # EmbeddedResource (MCP App extension — carries the UI HTML)
            resource = getattr(item, "resource", None)
            if resource is not None:
                mime = getattr(resource, "mimeType", "") or ""
                res_text = getattr(resource, "text", None)
                if "html" in mime and res_text:
                    html_content = res_text
                elif res_text:
                    text_parts.append(res_text)
                continue

            # ImageContent / other binary
            data = getattr(item, "data", None)
            if data is not None:
                text_parts.append(f"[binary data, {len(data)} bytes]")
                continue

            text_parts.append(str(item))

        combined = "\n".join(text_parts)

        # Attach HTML content as a clearly delimited block so the engine can
        # split it back out without needing to know about the tool name.
        if html_content:
            combined = (
                combined
                + "\n\n__MCP_HTML_RESOURCE__\n"
                + html_content
                + "\n__/MCP_HTML_RESOURCE__"
            )

        return combined


# Singleton instance
mcp_client_manager = MCPClientManager()
