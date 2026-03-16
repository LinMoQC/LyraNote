from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PublicNotebookOut(BaseModel):
    id: UUID
    title: str
    description: str | None
    summary_md: str | None = None
    cover_emoji: str | None = None
    cover_gradient: str | None = None
    source_count: int = 0
    word_count: int = 0
    published_at: datetime | None = None

    model_config = {"from_attributes": True}


class PublicNoteOut(BaseModel):
    id: UUID
    title: str | None
    content_json: dict | None
    content_text: str | None
    word_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicNotebookDetailOut(BaseModel):
    id: UUID
    title: str
    description: str | None
    summary_md: str | None = None
    cover_emoji: str | None = None
    cover_gradient: str | None = None
    source_count: int = 0
    word_count: int = 0
    published_at: datetime | None = None
    notes: list[PublicNoteOut] = []

    model_config = {"from_attributes": True}
