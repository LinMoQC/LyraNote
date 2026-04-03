import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._base import uuid_pk, now_col
from app.models._json import json_type


class MCPServerConfig(Base):
    """
    User-level configuration for external MCP (Model Context Protocol) servers.
    Each row represents one MCP server connection the agent can use as tool source.

    Transport types:
      - stdio: spawns a local process (command + args)
      - sse:   connects to a remote SSE/HTTP endpoint (url + optional headers)
    """
    __tablename__ = "mcp_server_configs"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Human-readable slug, unique per user
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200))
    # "stdio" | "sse"
    transport: Mapped[str] = mapped_column(String(20), nullable=False, default="stdio")
    # stdio: executable name, e.g. "npx" or "uvx"
    command: Mapped[str | None] = mapped_column(String(500))
    # stdio: argument list, e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    args: Mapped[list | None] = mapped_column(json_type)
    # sse: server URL, e.g. "http://localhost:3000/sse"
    url: Mapped[str | None] = mapped_column(Text)
    # sse: optional HTTP headers (e.g. auth token)
    headers: Mapped[dict | None] = mapped_column(json_type)
    # stdio: extra environment variables to inject into the subprocess
    env_vars: Mapped[dict | None] = mapped_column(json_type)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Cached list of tools discovered from this server, e.g. [{"name": "...", "description": "..."}]
    # Updated automatically on test-connection and during agent tool loading.
    discovered_tools: Mapped[list | None] = mapped_column(json_type)
    tools_discovered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
