from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NoteCreate(BaseModel):
    title: str | None = "Untitled"
    content_json: dict | None = None
    content_text: str | None = None
    word_count: int | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content_json: dict | None = None
    content_text: str | None = None
    word_count: int | None = None


class NoteOut(BaseModel):
    id: UUID
    notebook_id: UUID
    user_id: UUID
    title: str | None
    content_json: dict | None
    content_text: str | None
    word_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
