from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotebookCreate(BaseModel):
    title: str
    description: str | None = None


class NotebookUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None


class NotebookOut(BaseModel):
    id: UUID
    title: str
    description: str | None
    status: str
    source_count: int
    word_count: int = 0
    summary_md: str | None = None
    is_new: bool = False  # True only on the create response — triggers the import dialog
    is_public: bool = False
    published_at: datetime | None = None
    cover_emoji: str | None = None
    cover_gradient: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
