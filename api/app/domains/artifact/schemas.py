from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

ArtifactType = Literal["summary", "faq", "study_guide", "briefing"]


class ArtifactGenerateRequest(BaseModel):
    type: ArtifactType


class ArtifactOut(BaseModel):
    id: UUID
    notebook_id: UUID
    type: str
    title: str | None
    content_md: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
