from __future__ import annotations

from pydantic import BaseModel, Field


class DesktopRuntimeOut(BaseModel):
    profile: str
    health: str
    database_url: str
    memory_mode: str
    memory_dir: str
    stdout_events: bool


class DesktopJobOut(BaseModel):
    id: str
    kind: str
    state: str
    label: str
    progress: int = 0
    message: str | None = None
    resource_id: str | None = None
    created_at: str
    updated_at: str


class DesktopJobListOut(BaseModel):
    items: list[DesktopJobOut] = Field(default_factory=list)


class CancelJobResult(BaseModel):
    cancelled: bool
    reason: str | None = None


class WatchFolderOut(BaseModel):
    id: str
    path: str
    name: str
    created_at: str
    last_synced_at: str | None = None
    last_error: str | None = None
    is_active: bool = True


class CreateWatchFolderRequest(BaseModel):
    path: str


class DeleteWatchFolderRequest(BaseModel):
    id: str


class WatchFolderListOut(BaseModel):
    items: list[WatchFolderOut] = Field(default_factory=list)


class RecentImportOut(BaseModel):
    path: str
    source_id: str | None = None
    title: str | None = None
    imported_at: str


class RecentImportListOut(BaseModel):
    items: list[RecentImportOut] = Field(default_factory=list)


class ImportWatchFolderRequest(BaseModel):
    path: str


class ImportWatchFolderResult(BaseModel):
    state: str
    path: str
    source_id: str | None = None


class InspectLocalFileRequest(BaseModel):
    path: str
    sha256: str | None = None


class InspectLocalFileResult(BaseModel):
    state: str
    path: str
    source_id: str | None = None
    matched_path: str | None = None
    matched_title: str | None = None
    sha256: str | None = None


class LocalSearchHitOut(BaseModel):
    chunk_id: str
    source_id: str
    notebook_id: str
    source_title: str | None = None
    source_type: str
    chunk_index: int
    content: str
    excerpt: str
    rank: float | None = None
    metadata: dict | None = None


class LocalSearchOut(BaseModel):
    query: str
    mode: str
    items: list[LocalSearchHitOut] = Field(default_factory=list)


class LocalAnswerRequest(BaseModel):
    query: str
    notebook_id: str | None = None
    source_id: str | None = None
    limit: int = Field(default=5, ge=1, le=20)


class LocalAnswerCitationOut(BaseModel):
    source_id: str
    chunk_id: str
    source_title: str | None = None
    excerpt: str
    metadata: dict | None = None


class LocalAnswerOut(BaseModel):
    mode: str
    query: str
    answer: str
    citations: list[LocalAnswerCitationOut] = Field(default_factory=list)
