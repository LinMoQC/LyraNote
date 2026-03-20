"""Pydantic schemas for feedback domain endpoints."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class FeedbackIn(BaseModel):
    rating: Literal["like", "dislike"]
    comment: str | None = None


class FeedbackOut(BaseModel):
    message_id: UUID
    rating: str
    comment: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
