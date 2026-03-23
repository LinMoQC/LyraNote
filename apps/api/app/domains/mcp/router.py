"""
MCP Server Configuration API

Endpoints:
  GET    /mcp/servers           List current user's MCP server configs
  POST   /mcp/servers           Create a new MCP server config
  GET    /mcp/servers/{id}      Get one MCP server config
  PUT    /mcp/servers/{id}      Update an MCP server config
  DELETE /mcp/servers/{id}      Delete an MCP server config
  POST   /mcp/servers/{id}/test Test connection and list available tools
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.domains.mcp.schemas import (
    MCPServerCreate,
    MCPServerOut,
    MCPServerUpdate,
    MCPTestResult,
    MCPToolInfo,
)
from app.exceptions import NotFoundError
from app.models import MCPServerConfig
from app.schemas.response import ApiResponse, success

router = APIRouter(tags=["mcp"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_config_or_404(
    config_id: uuid.UUID,
    user_id: uuid.UUID,
    db,
) -> MCPServerConfig:
    result = await db.execute(
        select(MCPServerConfig).where(
            MCPServerConfig.id == config_id,
            MCPServerConfig.user_id == user_id,
        )
    )
    cfg = result.scalar_one_or_none()
    if cfg is None:
        raise NotFoundError("MCP server config not found")
    return cfg


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/mcp/servers", response_model=ApiResponse[list[MCPServerOut]])
async def list_mcp_servers(db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(MCPServerConfig)
        .where(MCPServerConfig.user_id == current_user.id)
        .order_by(MCPServerConfig.created_at)
    )
    configs = result.scalars().all()
    return success([MCPServerOut.model_validate(c) for c in configs])


@router.post(
    "/mcp/servers",
    response_model=ApiResponse[MCPServerOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_mcp_server(
    body: MCPServerCreate,
    db: DbDep,
    current_user: CurrentUser,
):
    cfg = MCPServerConfig(
        user_id=current_user.id,
        name=body.name,
        display_name=body.display_name,
        transport=body.transport,
        command=body.command,
        args=body.args,
        env_vars=body.env_vars,
        url=body.url,
        headers=body.headers,
        is_enabled=body.is_enabled,
    )
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return success(MCPServerOut.model_validate(cfg))


@router.get("/mcp/servers/{config_id}", response_model=ApiResponse[MCPServerOut])
async def get_mcp_server(
    config_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
):
    cfg = await _get_config_or_404(config_id, current_user.id, db)
    return success(MCPServerOut.model_validate(cfg))


@router.put("/mcp/servers/{config_id}", response_model=ApiResponse[MCPServerOut])
async def update_mcp_server(
    config_id: uuid.UUID,
    body: MCPServerUpdate,
    db: DbDep,
    current_user: CurrentUser,
):
    cfg = await _get_config_or_404(config_id, current_user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    await db.commit()
    await db.refresh(cfg)
    return success(MCPServerOut.model_validate(cfg))


@router.delete(
    "/mcp/servers/{config_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_mcp_server(
    config_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
):
    cfg = await _get_config_or_404(config_id, current_user.id, db)
    await db.delete(cfg)
    await db.commit()


@router.post("/mcp/servers/{config_id}/test", response_model=ApiResponse[MCPTestResult])
async def test_mcp_server(
    config_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
):
    """Test the connection to an MCP server and return its exposed tools.
    On success, the discovered tool list is persisted to the database.
    """
    from datetime import datetime, timezone

    cfg = await _get_config_or_404(config_id, current_user.id, db)

    from app.mcp.client import mcp_client_manager, _exc_msg

    try:
        raw_tools = await mcp_client_manager.get_tools(cfg)
        tools = [
            MCPToolInfo(
                name=t["name"],
                description=t.get("description") or "",
                input_schema=t.get("inputSchema") or {},
            )
            for t in raw_tools
        ]

        # Persist discovered tools to DB so the frontend can display them without reconnecting
        cfg.discovered_tools = [
            {"name": t["name"], "description": t.get("description") or ""}
            for t in raw_tools
        ]
        cfg.tools_discovered_at = datetime.now(timezone.utc)
        await db.commit()

        return success(MCPTestResult(ok=True, tools=tools))
    except BaseException as exc:
        return success(MCPTestResult(ok=False, error=_exc_msg(exc)))
