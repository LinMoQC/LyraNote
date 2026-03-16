from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TaskOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    task_type: str
    schedule_cron: str
    timezone: str
    parameters: dict
    delivery_config: dict
    enabled: bool
    last_run_at: datetime | None
    next_run_at: datetime
    run_count: int
    last_result: str | None
    last_error: str | None
    consecutive_failures: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    name: str
    topic: str
    schedule: str = "daily"
    delivery: str = "note"
    email: str | None = None
    notebook_id: str | None = None
    article_style: str = "brief"
    language: str = "zh"
    feed_urls: list[str] | None = None


class TaskUpdate(BaseModel):
    name: str | None = None
    schedule_cron: str | None = None
    parameters: dict | None = None
    delivery_config: dict | None = None
    enabled: bool | None = None


class TaskRunOut(BaseModel):
    id: UUID
    task_id: UUID
    status: str
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None
    result_summary: str | None
    error_message: str | None
    generated_content: str | None
    sources_count: int
    delivery_status: dict | None

    class Config:
        from_attributes = True


class ManualRunOut(BaseModel):
    run_id: str | None = None
    status: str
    message: str
