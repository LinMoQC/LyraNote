from __future__ import annotations

import asyncio

import pytest

from app.mcp.client import MCPClientManager


@pytest.mark.asyncio
async def test_call_tool_propagates_cancellation(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = MCPClientManager()

    async def cancelled_run(*_args, **_kwargs):
        raise asyncio.CancelledError()

    monkeypatch.setattr(manager, "_run", cancelled_run)

    with pytest.raises(asyncio.CancelledError):
        await manager.call_tool(
            config=object(),  # type: ignore[arg-type]
            tool_name="server__read_file",
            arguments={},
        )
