"""Pydantic schemas for the memory domain."""

from uuid import UUID

from pydantic import BaseModel


class MemoryDocOut(BaseModel):
    content_md: str
    updated_at: str | None = None

    model_config = {"from_attributes": True}


class MemoryDocUpdate(BaseModel):
    content_md: str


class MemoryOut(BaseModel):
    id: UUID
    key: str
    value: str
    confidence: float
    memory_type: str
    access_count: int
    last_accessed_at: str | None = None
    expires_at: str | None = None

    model_config = {"from_attributes": True}


class MemoryGroupedOut(BaseModel):
    preference: list[MemoryOut] = []
    fact: list[MemoryOut] = []
    skill: list[MemoryOut] = []


class MemoryUpdate(BaseModel):
    value: str


class ReflectionOut(BaseModel):
    id: UUID
    conversation_id: UUID | None = None
    scene: str | None = None
    quality_score: float | None = None
    what_worked: str | None = None
    what_failed: str | None = None
    memory_reinforced: list | None = None
    created_at: str

    model_config = {"from_attributes": True}


class EvaluationOut(BaseModel):
    id: UUID
    conversation_id: UUID | None = None
    overall_score: float | None = None
    relevance_score: float | None = None
    evidence_score: float | None = None
    actionability_score: float | None = None
    notes: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class DiaryEntryOut(BaseModel):
    date: str
    content: str
