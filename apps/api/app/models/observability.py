from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import JSON as SAJSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._base import now_col, uuid_pk

json_type = SAJSON().with_variant(JSONB(astext_type=Text()), "postgresql")


class ObservabilityRun(Base):
    __tablename__ = "observability_runs"

    id: Mapped[uuid.UUID] = uuid_pk()
    trace_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    run_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), index=True, nullable=False, default="running")
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True,
    )
    generation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("message_generations.id", ondelete="SET NULL"),
        nullable=True,
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    task_run_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    notebook_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("notebooks.id", ondelete="SET NULL"),
        nullable=True,
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column("metadata_json", json_type)
    started_at: Mapped[datetime] = now_col()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    spans: Mapped[list["ObservabilitySpan"]] = relationship(
        back_populates="run",
        passive_deletes=True,
        order_by="ObservabilitySpan.started_at.asc()",
    )
    llm_calls: Mapped[list["ObservabilityLLMCall"]] = relationship(
        back_populates="run",
        passive_deletes=True,
        order_by="ObservabilityLLMCall.started_at.asc()",
    )
    tool_calls: Mapped[list["ObservabilityToolCall"]] = relationship(
        back_populates="run",
        passive_deletes=True,
        order_by="ObservabilityToolCall.started_at.asc()",
    )


class ObservabilitySpan(Base):
    __tablename__ = "observability_spans"

    id: Mapped[uuid.UUID] = uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("observability_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trace_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    span_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column("metadata_json", json_type)
    started_at: Mapped[datetime] = now_col()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    run: Mapped[ObservabilityRun] = relationship(back_populates="spans")


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"
    __table_args__ = (
        UniqueConstraint("component", "instance_id", name="uq_worker_heartbeat_component_instance"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    component: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    instance_id: Mapped[str] = mapped_column(String(120), nullable=False)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    pid: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="healthy")
    metadata_json: Mapped[dict | None] = mapped_column("metadata_json", json_type)
    last_seen_at: Mapped[datetime] = now_col()


class ObservabilityLLMCall(Base):
    __tablename__ = "observability_llm_calls"

    id: Mapped[uuid.UUID] = uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("observability_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trace_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    call_type: Mapped[str] = mapped_column(String(40), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(40))
    model: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="success")
    finish_reason: Mapped[str | None] = mapped_column(String(40))
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    reasoning_tokens: Mapped[int | None] = mapped_column(Integer)
    cached_tokens: Mapped[int | None] = mapped_column(Integer)
    ttft_ms: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    prompt_snapshot: Mapped[dict | None] = mapped_column(json_type)
    response_snapshot: Mapped[dict | None] = mapped_column(json_type)
    metadata_json: Mapped[dict | None] = mapped_column("metadata_json", json_type)
    started_at: Mapped[datetime] = now_col()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    run: Mapped[ObservabilityRun] = relationship(back_populates="llm_calls")


class ObservabilityToolCall(Base):
    __tablename__ = "observability_tool_calls"

    id: Mapped[uuid.UUID] = uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("observability_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trace_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    tool_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="success")
    cache_hit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    result_count: Mapped[int | None] = mapped_column(Integer)
    followup_tool_hint: Mapped[str | None] = mapped_column(String(120))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    input_snapshot: Mapped[dict | None] = mapped_column(json_type)
    output_snapshot: Mapped[dict | None] = mapped_column(json_type)
    metadata_json: Mapped[dict | None] = mapped_column("metadata_json", json_type)
    started_at: Mapped[datetime] = now_col()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    run: Mapped[ObservabilityRun] = relationship(back_populates="tool_calls")
