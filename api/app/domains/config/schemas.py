"""Pydantic schemas for the config domain."""

from typing import Any

from pydantic import BaseModel


class ConfigOut(BaseModel):
    data: dict[str, str | None]


class ConfigPatchRequest(BaseModel):
    data: dict[str, Any]


class TestEmailResult(BaseModel):
    ok: bool
    message: str


class TestLlmResult(BaseModel):
    ok: bool
    model: str
    message: str
