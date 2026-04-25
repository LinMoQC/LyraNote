"""Pydantic schemas for the knowledge (AI writing) domain."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class SuggestRequest(BaseModel):
    cursor_text: str
    note_context: str = ""


class SuggestResponse(BaseModel):
    suggestion: str


class RewriteRequest(BaseModel):
    selected_text: str
    action: Literal["polish", "proofread", "reformat", "shorten", "expand"]
    note_context: str = ""


class RewriteResponse(BaseModel):
    result: str


class JobStatusOut(BaseModel):
    id: UUID
    type: str
    status: str
    error: str | None

    model_config = {"from_attributes": True}
