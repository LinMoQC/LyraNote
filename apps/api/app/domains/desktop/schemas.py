from __future__ import annotations

from pydantic import BaseModel, Field


class DesktopRuntimeOut(BaseModel):
    profile: str
    health: str
    database_url: str
    memory_mode: str
    stdout_events: bool


class DesktopJobOut(BaseModel):
    id: str
    state: str
    label: str


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


class CreateWatchFolderRequest(BaseModel):
    path: str


class DeleteWatchFolderRequest(BaseModel):
    id: str


class WatchFolderListOut(BaseModel):
    items: list[WatchFolderOut] = Field(default_factory=list)
