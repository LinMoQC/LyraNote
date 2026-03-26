import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._base import uuid_pk, now_col


class ScheduledTask(Base):
    __tablename__ = "scheduled_tasks"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # news_digest | research_update | knowledge_summary | custom_prompt
    task_type: Mapped[str] = mapped_column(String(50), default="news_digest", nullable=False)

    schedule_cron: Mapped[str] = mapped_column(String(100), nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Shanghai")

    parameters: Mapped[dict] = mapped_column(JSONB, default=dict)
    delivery_config: Mapped[dict] = mapped_column(JSONB, default=dict)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    last_result: Mapped[str | None] = mapped_column(Text)
    last_error: Mapped[str | None] = mapped_column(Text)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="scheduled_tasks")
    runs: Mapped[list["ScheduledTaskRun"]] = relationship(
        back_populates="task", passive_deletes=True, order_by="ScheduledTaskRun.started_at.desc()"
    )


class ScheduledTaskRun(Base):
    __tablename__ = "scheduled_task_runs"

    id: Mapped[uuid.UUID] = uuid_pk()
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scheduled_tasks.id", ondelete="CASCADE"))
    # running | success | failed | skipped
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    started_at: Mapped[datetime] = now_col()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    result_summary: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    generated_content: Mapped[str | None] = mapped_column(Text)
    sources_count: Mapped[int] = mapped_column(Integer, default=0)
    delivery_status: Mapped[dict | None] = mapped_column(JSONB)

    task: Mapped["ScheduledTask"] = relationship(back_populates="runs")


class ResearchTask(Base):
    __tablename__ = "research_tasks"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    notebook_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    query: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="quick")
    # running | done | error
    status: Mapped[str] = mapped_column(String(20), default="running")
    report: Mapped[str | None] = mapped_column(Text, nullable=True)
    deliverable_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    timeline_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = now_col()
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
