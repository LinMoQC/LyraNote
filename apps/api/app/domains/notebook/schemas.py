from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, field_validator


APPEARANCE_DEFAULTS = {
    "font_family": None,
    "theme_id": None,
    "font_size": None,
    "content_width": None,
    "line_height": None,
    "paragraph_spacing": None,
    "heading_scale": None,
    "emphasize_title": None,
    "auto_save": None,
    "focus_mode_default": None,
    "default_right_panel": None,
}


class NotebookCreate(BaseModel):
    title: str
    description: str | None = None


class NotebookUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    cover_emoji: str | None = None
    cover_gradient: str | None = None
    appearance_settings: dict[str, Any] | None = None


class NotebookOut(BaseModel):
    id: UUID
    title: str
    description: str | None
    status: str
    source_count: int
    note_count: int = 0
    word_count: int = 0
    summary_md: str | None = None
    is_new: bool = False  # True only on the create response — triggers the import dialog
    is_public: bool = False
    published_at: datetime | None = None
    cover_emoji: str | None = None
    cover_gradient: str | None = None
    appearance_settings: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("appearance_settings", mode="before")
    @classmethod
    def normalize_appearance_settings(cls, value: Any) -> dict[str, Any] | None:
        if value is None:
            return None
        if not isinstance(value, dict):
            return value
        return {**APPEARANCE_DEFAULTS, **value}
