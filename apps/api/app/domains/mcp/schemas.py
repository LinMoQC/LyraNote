from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator

_VALID_TRANSPORTS = ("stdio", "http", "sse")


class MCPServerCreate(BaseModel):
    name: str
    display_name: str | None = None
    transport: str = "stdio"
    # stdio fields
    command: str | None = None
    args: list[str] | None = None
    env_vars: dict[str, str] | None = None
    # http / sse fields
    url: str | None = None
    headers: dict[str, str] | None = None
    is_enabled: bool = True

    @field_validator("transport")
    @classmethod
    def validate_transport(cls, v: str) -> str:
        if v not in _VALID_TRANSPORTS:
            raise ValueError(f"transport must be one of {_VALID_TRANSPORTS}")
        return v


class MCPServerUpdate(BaseModel):
    display_name: str | None = None
    transport: str | None = None
    command: str | None = None
    args: list[str] | None = None
    env_vars: dict[str, str] | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    is_enabled: bool | None = None

    @field_validator("transport")
    @classmethod
    def validate_transport(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_TRANSPORTS:
            raise ValueError(f"transport must be one of {_VALID_TRANSPORTS}")
        return v


class MCPServerOut(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str | None
    transport: str
    command: str | None
    args: list[str] | None
    env_vars: dict[str, Any] | None
    url: str | None
    headers: dict[str, Any] | None
    is_enabled: bool
    discovered_tools: list[dict[str, Any]] | None
    tools_discovered_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MCPToolInfo(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any]


class MCPTestResult(BaseModel):
    ok: bool
    tools: list[MCPToolInfo] = []
    error: str | None = None
