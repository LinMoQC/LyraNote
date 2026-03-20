from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class SourceImportUrl(BaseModel):
    url: str
    title: str | None = None


class SourceOut(BaseModel):
    id: UUID
    notebook_id: UUID
    title: str | None
    type: str
    status: str
    url: str | None
    summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SourcePage(BaseModel):
    items: list[SourceOut]
    total: int
    offset: int
    limit: int
    has_more: bool

    model_config = {"from_attributes": True}


class ChunkOut(BaseModel):
    id: UUID
    chunk_index: int
    content: str
    token_count: int | None

    model_config = {"from_attributes": True}


class SourceUpdate(BaseModel):
    notebook_id: UUID | None = None
    title: str | None = None


class RechunkRequest(BaseModel):
    """
    Predefined strategies:
      coarse   – 600 chars / 100 overlap
      standard – 512 chars / 64 overlap (default)
      fine     – 256 chars / 32 overlap
    Or override manually via chunk_size / chunk_overlap.
    """
    strategy: str = "standard"   # coarse | standard | fine | custom
    chunk_size: int | None = None
    chunk_overlap: int | None = None


STRATEGY_PARAMS: dict[str, tuple[int, int]] = {
    "coarse":   (600, 100),
    "standard": (512,  64),
    "fine":     (256,  32),
}
