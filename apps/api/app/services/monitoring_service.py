from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
import re
import socket
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from statistics import quantiles
from typing import Any

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.database import AsyncSessionLocal
from app.exceptions import BadRequestError
from app.models import (
    MessageGeneration,
    Notebook,
    ObservabilityLLMCall,
    ObservabilityRun,
    ObservabilitySpan,
    ObservabilityToolCall,
    ResearchTask,
    ScheduledTask,
    ScheduledTaskRun,
    Source,
    WorkerHeartbeat,
)
from app.trace import (
    get_observability_run_id,
    get_trace_id,
    set_observability_run_id,
    set_trace_id,
    reset_observability_run_id,
    reset_trace_id,
)

logger = logging.getLogger(__name__)

_WINDOW_RE = re.compile(r"^(?P<value>\d+)(?P<unit>[mhd])$")
CHAT_STUCK_MINUTES = 5
RESEARCH_STUCK_MINUTES = 30
SCHEDULED_STUCK_MINUTES = 15
SOURCE_INGEST_STUCK_MINUTES = 15
SNAPSHOT_HEAD_CHARS = 2000
SNAPSHOT_TAIL_CHARS = 1000
OBSERVABILITY_RUN_TYPES = (
    "chat_generation",
    "research_task",
    "scheduled_task_run",
    "source_ingest",
)
DEFAULT_TRACE_RUN_TYPES = OBSERVABILITY_RUN_TYPES
SUCCESS_STATUSES = {"succeeded"}
_OBSERVABILITY_STATUS_MAP = {
    "success": "succeeded",
    "done": "succeeded",
    "completed": "succeeded",
    "succeeded": "succeeded",
    "error": "failed",
    "failed": "failed",
    "running": "running",
    "cancelled": "cancelled",
    "stuck": "stuck",
}
_WORKLOAD_STATUS_MAP = {
    **_OBSERVABILITY_STATUS_MAP,
    "pending": "running",
    "processing": "running",
    "queued": "running",
    "indexed": "succeeded",
}


@asynccontextmanager
async def _background_monitoring_session() -> AsyncIterator[AsyncSession]:
    """Create a short-lived async session bound to the current event loop."""
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    finally:
        await engine.dispose()


def utcnow() -> datetime:
    return datetime.now(UTC)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def parse_window(window: str) -> timedelta:
    match = _WINDOW_RE.match((window or "24h").strip())
    if not match:
        return timedelta(hours=24)
    value = int(match.group("value"))
    unit = match.group("unit")
    if unit == "m":
        return timedelta(minutes=value)
    if unit == "d":
        return timedelta(days=value)
    return timedelta(hours=value)


def compute_percentile(values: list[int], percentile: float) -> int | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    bucket = quantiles(values, n=100)
    index = max(0, min(len(bucket) - 1, int(percentile) - 1))
    return round(bucket[index])


def normalize_observability_status(status: str | None) -> str:
    raw = (status or "running").strip().lower()
    return _OBSERVABILITY_STATUS_MAP.get(raw, raw)


def normalize_workload_status(status: str | None) -> str:
    raw = (status or "running").strip().lower()
    return _WORKLOAD_STATUS_MAP.get(raw, raw)


def build_observability_status_filter(status: str | None) -> tuple[str, ...]:
    normalized = normalize_observability_status(status)
    if normalized == "succeeded":
        return ("succeeded", "success", "done", "completed")
    if normalized == "failed":
        return ("failed", "error")
    return (normalized,)


def success_status(status: str) -> bool:
    return normalize_observability_status(status) in SUCCESS_STATUSES


def infer_span_component(run_type: str | None, span_name: str | None = None) -> str:
    if run_type == "source_ingest":
        if span_name == "source_ingest.upload":
            return "api"
        return "ingest"
    return "worker"


def encode_trace_cursor(started_at: datetime, run_id: uuid.UUID) -> str:
    return f"{ensure_utc(started_at).isoformat()}|{run_id}"


def decode_trace_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw_started_at, raw_id = cursor.split("|", 1)
        return ensure_utc(datetime.fromisoformat(raw_started_at)), uuid.UUID(raw_id)
    except (TypeError, ValueError) as exc:  # pragma: no cover - guarded by API tests
        raise BadRequestError("cursor 无效") from exc


def build_worker_instance_id(component: str) -> str:
    return f"{component}:{socket.gethostname()}:{os.getpid()}"


def classify_worker_status(last_seen_at: datetime, *, stale_after_seconds: int | None = None) -> str:
    threshold = stale_after_seconds or settings.monitoring_heartbeat_stale_seconds
    age = utcnow() - ensure_utc(last_seen_at)
    if age.total_seconds() <= threshold:
        return "healthy"
    if age.total_seconds() <= threshold * 2:
        return "stale"
    return "down"


def _normalize_snapshot_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list, tuple)):
        try:
            return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
        except TypeError:
            return str(value)
    return str(value)


def build_text_snapshot(
    value: Any,
    *,
    head_chars: int = SNAPSHOT_HEAD_CHARS,
    tail_chars: int = SNAPSHOT_TAIL_CHARS,
    redaction_applied: bool = False,
    no_truncate: bool = False,
) -> dict[str, Any]:
    raw = _normalize_snapshot_value(value)
    if not raw:
        return {
            "raw_preview": "",
            "char_count": 0,
            "sha256": hashlib.sha256(b"").hexdigest(),
            "redaction_applied": redaction_applied,
            "truncated": False,
        }

    if no_truncate:
        return {
            "raw_preview": raw,
            "char_count": len(raw),
            "sha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            "redaction_applied": redaction_applied,
            "truncated": False,
        }

    truncated = len(raw) > (head_chars + tail_chars)
    preview = raw
    if truncated:
        preview = f"{raw[:head_chars]}\n\n...[truncated]...\n\n{raw[-tail_chars:]}"

    return {
        "raw_preview": preview,
        "char_count": len(raw),
        "sha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        "redaction_applied": redaction_applied,
        "truncated": truncated,
    }


def estimate_tokens(value: Any) -> int:
    raw = _normalize_snapshot_value(value)
    if not raw.strip():
        return 0
    return max(1, math.ceil(len(raw) / 3))


def estimate_message_tokens(messages: list[dict[str, Any]]) -> int:
    return sum(estimate_tokens(message.get("content")) for message in messages)


def extract_usage_metrics(payload: Any) -> dict[str, int | None]:
    if payload is None:
        return {
            "input_tokens": None,
            "output_tokens": None,
            "reasoning_tokens": None,
            "cached_tokens": None,
        }

    usage = payload.get("usage") if isinstance(payload, dict) else getattr(payload, "usage", None)
    if usage is None:
        return {
            "input_tokens": None,
            "output_tokens": None,
            "reasoning_tokens": None,
            "cached_tokens": None,
        }

    def _pick(obj: Any, *names: str) -> int | None:
        for name in names:
            value = obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)
            if value is not None:
                try:
                    return int(value)
                except (TypeError, ValueError):
                    return None
        return None

    prompt_tokens = _pick(usage, "prompt_tokens", "input_tokens")
    completion_tokens = _pick(usage, "completion_tokens", "output_tokens")
    reasoning_tokens = _pick(usage, "reasoning_tokens")
    cached_tokens = _pick(usage, "cached_tokens")

    completion_details = usage.get("completion_tokens_details") if isinstance(usage, dict) else getattr(usage, "completion_tokens_details", None)
    if reasoning_tokens is None and completion_details is not None:
        reasoning_tokens = _pick(completion_details, "reasoning_tokens")

    prompt_details = usage.get("prompt_tokens_details") if isinstance(usage, dict) else getattr(usage, "prompt_tokens_details", None)
    if cached_tokens is None and prompt_details is not None:
        cached_tokens = _pick(prompt_details, "cached_tokens")

    return {
        "input_tokens": prompt_tokens,
        "output_tokens": completion_tokens,
        "reasoning_tokens": reasoning_tokens,
        "cached_tokens": cached_tokens,
    }


async def create_observability_run(
    db: AsyncSession,
    *,
    trace_id: str,
    run_type: str,
    name: str,
    status: str = "running",
    user_id: uuid.UUID | None = None,
    conversation_id: uuid.UUID | None = None,
    generation_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
    task_run_id: uuid.UUID | None = None,
    notebook_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
    started_at: datetime | None = None,
) -> ObservabilityRun:
    if run_type not in OBSERVABILITY_RUN_TYPES:
        raise ValueError(f"Unsupported observability run_type: {run_type}")

    run = ObservabilityRun(
        trace_id=trace_id,
        run_type=run_type,
        name=name,
        status=normalize_observability_status(status),
        user_id=user_id,
        conversation_id=conversation_id,
        generation_id=generation_id,
        task_id=task_id,
        task_run_id=task_run_id,
        notebook_id=notebook_id,
        metadata_json=metadata,
        started_at=started_at or utcnow(),
    )
    db.add(run)
    await db.flush()
    return run


async def update_observability_run(
    db: AsyncSession,
    run: ObservabilityRun,
    *,
    status: str | None = None,
    metadata: dict[str, Any] | None = None,
    error_message: str | None = None,
    finished_at: datetime | None = None,
) -> ObservabilityRun:
    if status is not None:
        run.status = normalize_observability_status(status)
    if metadata:
        run.metadata_json = {**(run.metadata_json or {}), **metadata}
    if error_message is not None:
        run.error_message = error_message[:2000] if error_message else None
    if finished_at is not None:
        run.finished_at = finished_at
        run.duration_ms = max(0, int((finished_at - ensure_utc(run.started_at)).total_seconds() * 1000))
    await db.flush()
    return run


async def finish_observability_run(
    db: AsyncSession,
    run: ObservabilityRun,
    *,
    status: str,
    metadata: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> ObservabilityRun:
    return await update_observability_run(
        db,
        run,
        status=status,
        metadata=metadata,
        error_message=error_message,
        finished_at=utcnow(),
    )


async def record_completed_llm_call(
    db: AsyncSession,
    *,
    call_type: str,
    prompt: Any,
    response: Any,
    provider: str | None = None,
    model: str | None = None,
    finish_reason: str | None = None,
    run: ObservabilityRun | None = None,
    status: str = "success",
    error_message: str | None = None,
    metadata: dict[str, Any] | None = None,
    usage: Any = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    reasoning_tokens: int | None = None,
    cached_tokens: int | None = None,
    ttft_ms: int | None = None,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
    duration_ms: int | None = None,
) -> ObservabilityLLMCall | None:
    resolved_run = run
    if resolved_run is None:
        run_id = get_observability_run_id()
        if run_id:
            resolved_run = await db.get(ObservabilityRun, uuid.UUID(run_id))
    if resolved_run is None:
        return None

    usage_metrics = extract_usage_metrics(usage)
    prompt_text = _normalize_snapshot_value(prompt)
    response_text = _normalize_snapshot_value(response)
    input_value = input_tokens if input_tokens is not None else usage_metrics["input_tokens"] or estimate_tokens(prompt_text)
    output_value = output_tokens if output_tokens is not None else usage_metrics["output_tokens"] or estimate_tokens(response_text)
    call_started_at = started_at or utcnow()
    call_finished_at = finished_at or call_started_at
    computed_duration = duration_ms
    if computed_duration is None:
        computed_duration = max(0, int((call_finished_at - call_started_at).total_seconds() * 1000))

    row = ObservabilityLLMCall(
        run_id=resolved_run.id,
        trace_id=resolved_run.trace_id,
        call_type=call_type,
        provider=provider,
        model=model,
        status=normalize_observability_status(status),
        finish_reason=finish_reason,
        input_tokens=input_value,
        output_tokens=output_value,
        reasoning_tokens=reasoning_tokens if reasoning_tokens is not None else usage_metrics["reasoning_tokens"],
        cached_tokens=cached_tokens if cached_tokens is not None else usage_metrics["cached_tokens"],
        ttft_ms=ttft_ms,
        duration_ms=computed_duration,
        error_message=error_message[:2000] if error_message else None,
        prompt_snapshot=build_text_snapshot(prompt_text, no_truncate=True),
        response_snapshot=build_text_snapshot(response_text),
        metadata_json=metadata,
        started_at=call_started_at,
        finished_at=call_finished_at,
    )
    db.add(row)
    await db.flush()
    return row


async def record_completed_tool_call(
    db: AsyncSession,
    *,
    tool_name: str,
    tool_args: Any,
    tool_result: Any,
    run: ObservabilityRun | None = None,
    status: str = "success",
    cache_hit: bool = False,
    result_count: int | None = None,
    followup_tool_hint: str | None = None,
    metadata: dict[str, Any] | None = None,
    error_message: str | None = None,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
    duration_ms: int | None = None,
) -> ObservabilityToolCall | None:
    resolved_run = run
    if resolved_run is None:
        run_id = get_observability_run_id()
        if run_id:
            resolved_run = await db.get(ObservabilityRun, uuid.UUID(run_id))
    if resolved_run is None:
        return None

    call_started_at = started_at or utcnow()
    call_finished_at = finished_at or call_started_at
    computed_duration = duration_ms
    if computed_duration is None:
        computed_duration = max(0, int((call_finished_at - call_started_at).total_seconds() * 1000))

    row = ObservabilityToolCall(
        run_id=resolved_run.id,
        trace_id=resolved_run.trace_id,
        tool_name=tool_name,
        status=normalize_observability_status(status),
        cache_hit=cache_hit,
        result_count=result_count,
        followup_tool_hint=followup_tool_hint,
        duration_ms=computed_duration,
        error_message=error_message[:2000] if error_message else None,
        input_snapshot=build_text_snapshot(tool_args),
        output_snapshot=build_text_snapshot(tool_result),
        metadata_json=metadata,
        started_at=call_started_at,
        finished_at=call_finished_at,
    )
    db.add(row)
    await db.flush()
    return row


async def summarize_run_details(db: AsyncSession, run_id: uuid.UUID) -> dict[str, int]:
    llm_calls = list((await db.execute(
        select(ObservabilityLLMCall).where(ObservabilityLLMCall.run_id == run_id)
    )).scalars().all())
    tool_calls = list((await db.execute(
        select(ObservabilityToolCall).where(ObservabilityToolCall.run_id == run_id)
    )).scalars().all())

    return {
        "total_llm_calls": len(llm_calls),
        "total_tool_calls": len(tool_calls),
        "total_input_tokens": sum(call.input_tokens or 0 for call in llm_calls),
        "total_output_tokens": sum(call.output_tokens or 0 for call in llm_calls),
        "total_reasoning_tokens": sum(call.reasoning_tokens or 0 for call in llm_calls),
    }


@asynccontextmanager
async def traced_span(
    db: AsyncSession,
    span_name: str,
    *,
    run: ObservabilityRun | None = None,
    parent_span: ObservabilitySpan | None = None,
    component: str | None = None,
    span_kind: str | None = "phase",
    metadata: dict[str, Any] | None = None,
) -> AsyncIterator[ObservabilitySpan]:
    resolved_run = run
    if resolved_run is None:
        run_id = get_observability_run_id()
        if run_id:
            resolved_run = await db.get(ObservabilityRun, uuid.UUID(run_id))
    if resolved_run is None:
        yield ObservabilitySpan(trace_id=get_trace_id() or "", span_name=span_name, component=component, span_kind=span_kind)
        return

    span = ObservabilitySpan(
        run_id=resolved_run.id,
        parent_span_id=parent_span.id if parent_span else None,
        trace_id=resolved_run.trace_id,
        span_name=span_name,
        component=component or infer_span_component(resolved_run.run_type, span_name),
        span_kind=span_kind,
        status="running",
        metadata_json=metadata,
        started_at=utcnow(),
    )
    db.add(span)
    await db.flush()
    started = time.monotonic()
    try:
        yield span
    except Exception as exc:
        span.status = "failed"
        span.error_message = str(exc)[:2000]
        span.finished_at = utcnow()
        span.duration_ms = int((time.monotonic() - started) * 1000)
        await db.flush()
        raise
    else:
        span.status = "succeeded"
        span.finished_at = utcnow()
        span.duration_ms = int((time.monotonic() - started) * 1000)
        await db.flush()


async def record_instant_span(
    db: AsyncSession,
    span_name: str,
    *,
    run: ObservabilityRun | None = None,
    parent_span: ObservabilitySpan | None = None,
    component: str | None = None,
    span_kind: str | None = "phase",
    status: str = "succeeded",
    metadata: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> ObservabilitySpan | None:
    resolved_run = run
    if resolved_run is None:
        run_id = get_observability_run_id()
        if run_id:
            resolved_run = await db.get(ObservabilityRun, uuid.UUID(run_id))
    if resolved_run is None:
        return None

    now = utcnow()
    span = ObservabilitySpan(
        run_id=resolved_run.id,
        parent_span_id=parent_span.id if parent_span else None,
        trace_id=resolved_run.trace_id,
        span_name=span_name,
        component=component or infer_span_component(resolved_run.run_type, span_name),
        span_kind=span_kind,
        status=normalize_observability_status(status),
        error_message=error_message[:2000] if error_message else None,
        metadata_json=metadata,
        started_at=now,
        finished_at=now,
        duration_ms=0,
    )
    db.add(span)
    await db.flush()
    return span


async def record_completed_span(
    db: AsyncSession,
    span_name: str,
    *,
    run: ObservabilityRun | None = None,
    parent_span: ObservabilitySpan | None = None,
    component: str | None = None,
    span_kind: str | None = "phase",
    status: str = "succeeded",
    metadata: dict[str, Any] | None = None,
    error_message: str | None = None,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
    duration_ms: int | None = None,
) -> ObservabilitySpan | None:
    resolved_run = run
    if resolved_run is None:
        run_id = get_observability_run_id()
        if run_id:
            resolved_run = await db.get(ObservabilityRun, uuid.UUID(run_id))
    if resolved_run is None:
        return None

    span_started_at = started_at or utcnow()
    span_finished_at = finished_at or span_started_at
    computed_duration = duration_ms
    if computed_duration is None:
        computed_duration = max(0, int((span_finished_at - span_started_at).total_seconds() * 1000))

    span = ObservabilitySpan(
        run_id=resolved_run.id,
        parent_span_id=parent_span.id if parent_span else None,
        trace_id=resolved_run.trace_id,
        span_name=span_name,
        component=component or infer_span_component(resolved_run.run_type, span_name),
        span_kind=span_kind,
        status=normalize_observability_status(status),
        error_message=error_message[:2000] if error_message else None,
        metadata_json=metadata,
        started_at=span_started_at,
        finished_at=span_finished_at,
        duration_ms=computed_duration,
    )
    db.add(span)
    await db.flush()
    return span


async def get_or_create_source_ingest_run(
    db: AsyncSession,
    *,
    source_id: uuid.UUID,
    notebook_id: uuid.UUID | None,
    user_id: uuid.UUID | None = None,
    trace_id: str | None = None,
    run_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> ObservabilityRun:
    if run_id is not None:
        existing = await db.get(ObservabilityRun, run_id)
        if existing is not None:
            return existing

    resolved_trace_id = trace_id or get_trace_id() or uuid.uuid4().hex
    return await create_observability_run(
        db,
        trace_id=resolved_trace_id,
        run_type="source_ingest",
        name="source.ingest",
        status="running",
        user_id=user_id,
        task_id=source_id,
        notebook_id=notebook_id,
        metadata=metadata or {"source_id": str(source_id)},
    )


async def touch_worker_heartbeat(
    component: str,
    *,
    db: AsyncSession | None = None,
    metadata: dict[str, Any] | None = None,
    instance_id: str | None = None,
) -> WorkerHeartbeat:
    if db is None:
        async with _background_monitoring_session() as background_db:
            return await touch_worker_heartbeat(
                component,
                db=background_db,
                metadata=metadata,
                instance_id=instance_id,
            )

    assert db is not None
    instance = instance_id or build_worker_instance_id(component)
    result = await db.execute(
        select(WorkerHeartbeat).where(
            WorkerHeartbeat.component == component,
            WorkerHeartbeat.instance_id == instance,
        )
    )
    heartbeat = result.scalar_one_or_none()
    payload = metadata or {}
    if heartbeat is None:
        heartbeat = WorkerHeartbeat(
            component=component,
            instance_id=instance,
            hostname=socket.gethostname(),
            pid=os.getpid(),
            status="healthy",
            metadata_json=payload,
            last_seen_at=utcnow(),
        )
        db.add(heartbeat)
    else:
        heartbeat.hostname = socket.gethostname()
        heartbeat.pid = os.getpid()
        heartbeat.status = "healthy"
        heartbeat.last_seen_at = utcnow()
        heartbeat.metadata_json = {**(heartbeat.metadata_json or {}), **payload}
    await db.flush()
    return heartbeat


async def cleanup_observability_data(db: AsyncSession, *, retention_days: int | None = None) -> dict[str, int]:
    days = retention_days or settings.monitoring_retention_days
    cutoff = utcnow() - timedelta(days=days)

    deleted_spans = 0
    deleted_runs = 0
    deleted_heartbeats = 0

    result = await db.execute(select(ObservabilitySpan).where(ObservabilitySpan.started_at < cutoff))
    spans = list(result.scalars().all())
    for span in spans:
        await db.delete(span)
        deleted_spans += 1

    result = await db.execute(select(ObservabilityRun).where(ObservabilityRun.started_at < cutoff))
    runs = list(result.scalars().all())
    for run in runs:
        await db.delete(run)
        deleted_runs += 1

    heartbeat_cutoff = utcnow() - timedelta(seconds=settings.monitoring_heartbeat_stale_seconds * 6)
    result = await db.execute(select(WorkerHeartbeat).where(WorkerHeartbeat.last_seen_at < heartbeat_cutoff))
    heartbeats = list(result.scalars().all())
    for heartbeat in heartbeats:
        await db.delete(heartbeat)
        deleted_heartbeats += 1

    await db.flush()
    return {
        "deleted_spans": deleted_spans,
        "deleted_runs": deleted_runs,
        "deleted_heartbeats": deleted_heartbeats,
    }


@dataclass
class WorkloadThreshold:
    kind: str
    max_age: timedelta


WORKLOAD_THRESHOLDS = {
    "chat_generation": WorkloadThreshold("chat_generation", timedelta(minutes=CHAT_STUCK_MINUTES)),
    "research_task": WorkloadThreshold("research_task", timedelta(minutes=RESEARCH_STUCK_MINUTES)),
    "scheduled_task_run": WorkloadThreshold("scheduled_task_run", timedelta(minutes=SCHEDULED_STUCK_MINUTES)),
    "source_ingest": WorkloadThreshold("source_ingest", timedelta(minutes=SOURCE_INGEST_STUCK_MINUTES)),
}


class MonitoringService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def overview(self, *, window: str = "24h") -> dict[str, Any]:
        since = utcnow() - parse_window(window)
        business_runs = await self._load_runs(select(ObservabilityRun).where(
            ObservabilityRun.run_type.in_(DEFAULT_TRACE_RUN_TYPES),
            ObservabilityRun.started_at >= since,
        ))
        chat_runs = await self._load_runs(select(ObservabilityRun).where(
            ObservabilityRun.run_type == "chat_generation",
            ObservabilityRun.started_at >= since,
        ))
        workers = await self.list_workers()
        workloads = await self.list_workloads()

        http_durations = [run.duration_ms for run in business_runs if run.duration_ms is not None]
        request_total = len(business_runs)
        request_5xx = sum(1 for run in business_runs if normalize_observability_status(run.status) == "failed")
        chat_total = len(chat_runs)
        chat_success = sum(1 for run in chat_runs if success_status(run.status))

        return {
            "window": window,
            "requests": {
                "total": request_total,
                "errors_5xx": request_5xx,
                "p50_ms": compute_percentile(http_durations, 50),
                "p95_ms": compute_percentile(http_durations, 95),
            },
            "chat": {
                "total": chat_total,
                "success_rate": round((chat_success / chat_total) * 100, 1) if chat_total else None,
            },
            "workloads": {
                "running": sum(item["running_count"] for item in workloads["summary"]),
                "stuck": sum(item["stuck_count"] for item in workloads["summary"]),
            },
            "workers": {
                "total": len(workers),
                "healthy": sum(1 for worker in workers if worker["status"] == "healthy"),
                "stale": sum(1 for worker in workers if worker["status"] == "stale"),
                "down": sum(1 for worker in workers if worker["status"] == "down"),
            },
        }

    async def list_traces(
        self,
        *,
        window: str = "24h",
        run_type: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        user_id: uuid.UUID | None = None,
        conversation_id: uuid.UUID | None = None,
        generation_id: uuid.UUID | None = None,
        task_id: uuid.UUID | None = None,
        task_run_id: uuid.UUID | None = None,
        notebook_id: uuid.UUID | None = None,
        limit: int = 20,
    ) -> dict[str, Any]:
        since = utcnow() - parse_window(window)
        base_stmt = self._apply_run_filters(
            select(ObservabilityRun).where(ObservabilityRun.started_at >= since),
            run_type=run_type,
            status=status,
            user_id=user_id,
            conversation_id=conversation_id,
            generation_id=generation_id,
            task_id=task_id,
            task_run_id=task_run_id,
            notebook_id=notebook_id,
        )

        total = int((await self.db.execute(
            select(func.count()).select_from(base_stmt.subquery())
        )).scalar_one() or 0)

        stmt = base_stmt
        if cursor:
            cursor_started_at, cursor_run_id = decode_trace_cursor(cursor)
            stmt = stmt.where(or_(
                ObservabilityRun.started_at < cursor_started_at,
                and_(
                    ObservabilityRun.started_at == cursor_started_at,
                    ObservabilityRun.id < cursor_run_id,
                ),
            ))
        stmt = stmt.order_by(ObservabilityRun.started_at.desc(), ObservabilityRun.id.desc()).limit(limit + 1)
        runs = await self._load_runs(stmt)
        has_more = len(runs) > limit
        items = runs[:limit]
        return {
            "items": [self._serialize_run(run) for run in items],
            "total": total,
            "next_cursor": encode_trace_cursor(items[-1].started_at, items[-1].id) if has_more and items else None,
        }

    async def get_trace_detail(self, trace_id: str) -> dict[str, Any]:
        runs = await self._load_runs(
            select(ObservabilityRun)
            .where(ObservabilityRun.trace_id == trace_id)
            .order_by(ObservabilityRun.started_at.asc())
        )
        spans = list((await self.db.execute(
            select(ObservabilitySpan)
            .where(ObservabilitySpan.trace_id == trace_id)
            .order_by(ObservabilitySpan.started_at.asc(), ObservabilitySpan.id.asc())
        )).scalars().all())
        llm_calls = list((await self.db.execute(
            select(ObservabilityLLMCall)
            .where(ObservabilityLLMCall.trace_id == trace_id)
            .order_by(ObservabilityLLMCall.started_at.asc())
        )).scalars().all())
        tool_calls = list((await self.db.execute(
            select(ObservabilityToolCall)
            .where(ObservabilityToolCall.trace_id == trace_id)
            .order_by(ObservabilityToolCall.started_at.asc())
        )).scalars().all())

        if runs:
            started_at = min(ensure_utc(run.started_at) for run in runs)
            finished_at = max(ensure_utc(run.finished_at or run.started_at) for run in runs)
            total_duration_ms = max(0, int((finished_at - started_at).total_seconds() * 1000))
            final_status = normalize_observability_status(runs[-1].status)
        else:
            total_duration_ms = 0
            final_status = "unknown"
        return {
            "trace_id": trace_id,
            "runs": [self._serialize_run(run) for run in runs],
            "spans": [self._serialize_span(span) for span in spans],
            "llm_calls": [self._serialize_llm_call(call) for call in llm_calls],
            "tool_calls": [self._serialize_tool_call(call) for call in tool_calls],
            "summary": {
                "total_duration_ms": total_duration_ms,
                "total_llm_calls": len(llm_calls),
                "total_tool_calls": len(tool_calls),
                "total_input_tokens": sum(call.input_tokens or 0 for call in llm_calls),
                "total_output_tokens": sum(call.output_tokens or 0 for call in llm_calls),
                "final_status": final_status,
            },
        }

    async def list_failures(
        self,
        *,
        window: str = "24h",
        kind: str | None = None,
        user_id: uuid.UUID | None = None,
        conversation_id: uuid.UUID | None = None,
        generation_id: uuid.UUID | None = None,
        task_id: uuid.UUID | None = None,
        task_run_id: uuid.UUID | None = None,
        notebook_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        since = utcnow() - parse_window(window)
        items: list[dict[str, Any]] = []

        if kind in (None, "chat_generation"):
            stmt = select(MessageGeneration).where(
                    MessageGeneration.started_at >= since,
                    MessageGeneration.status.in_(("error", "failed")),
                )
            if user_id is not None:
                stmt = stmt.where(MessageGeneration.user_id == user_id)
            if conversation_id is not None:
                stmt = stmt.where(MessageGeneration.conversation_id == conversation_id)
            if generation_id is not None:
                stmt = stmt.where(MessageGeneration.id == generation_id)
            generations = list((await self.db.execute(stmt)).scalars().all())
            trace_map = await self._load_trace_map(
                run_type="chat_generation",
                field_name="generation_id",
                ids=[generation.id for generation in generations],
            )
            for generation in generations:
                trace_id = trace_map.get(generation.id)
                items.append({
                    "kind": "chat_generation",
                    "id": str(generation.id),
                    "status": normalize_workload_status(generation.status),
                    "message": generation.error_message,
                    "trace_id": trace_id,
                    "trace_available": trace_id is not None,
                    "trace_missing_reason": None if trace_id else "trace_not_found",
                    "conversation_id": str(generation.conversation_id),
                    "created_at": generation.started_at,
                })

        if kind in (None, "research_task"):
            stmt = select(ResearchTask).where(
                    ResearchTask.created_at >= since,
                    ResearchTask.status.in_(("error", "failed")),
                )
            if user_id is not None:
                stmt = stmt.where(ResearchTask.user_id == user_id)
            if conversation_id is not None:
                stmt = stmt.where(ResearchTask.conversation_id == conversation_id)
            if task_id is not None:
                stmt = stmt.where(ResearchTask.id == task_id)
            if notebook_id is not None:
                stmt = stmt.where(ResearchTask.notebook_id == str(notebook_id))
            tasks = list((await self.db.execute(stmt)).scalars().all())
            trace_map = await self._load_trace_map(
                run_type="research_task",
                field_name="task_id",
                ids=[task.id for task in tasks],
            )
            for task in tasks:
                trace_id = trace_map.get(task.id)
                items.append({
                    "kind": "research_task",
                    "id": str(task.id),
                    "status": normalize_workload_status(task.status),
                    "message": task.error_message,
                    "trace_id": trace_id,
                    "trace_available": trace_id is not None,
                    "trace_missing_reason": None if trace_id else "trace_not_found",
                    "conversation_id": str(task.conversation_id) if task.conversation_id else None,
                    "created_at": task.created_at,
                })

        if kind in (None, "scheduled_task_run"):
            stmt = (
                select(ScheduledTaskRun, ScheduledTask.name)
                .join(ScheduledTask, ScheduledTaskRun.task_id == ScheduledTask.id)
                .where(ScheduledTaskRun.started_at >= since, ScheduledTaskRun.status.in_(("failed", "error")))
            )
            if user_id is not None:
                stmt = stmt.where(ScheduledTask.user_id == user_id)
            if task_id is not None:
                stmt = stmt.where(ScheduledTaskRun.task_id == task_id)
            if task_run_id is not None:
                stmt = stmt.where(ScheduledTaskRun.id == task_run_id)
            runs = list((await self.db.execute(stmt)).all())
            trace_map = await self._load_trace_map(
                run_type="scheduled_task_run",
                field_name="task_run_id",
                ids=[run.id for run, _ in runs],
            )
            for run, task_name in runs:
                trace_id = trace_map.get(run.id)
                items.append({
                    "kind": "scheduled_task_run",
                    "id": str(run.id),
                    "status": normalize_workload_status(run.status),
                    "message": run.error_message,
                    "title": task_name,
                    "trace_id": trace_id,
                    "trace_available": trace_id is not None,
                    "trace_missing_reason": None if trace_id else "trace_not_found",
                    "created_at": run.started_at,
                })

        if kind in (None, "source_ingest"):
            stmt = select(Source).where(Source.updated_at >= since, Source.status == "failed")
            if user_id is not None:
                stmt = stmt.join(Notebook, Source.notebook_id == Notebook.id).where(Notebook.user_id == user_id)
            if notebook_id is not None:
                stmt = stmt.where(Source.notebook_id == notebook_id)
            if task_id is not None:
                stmt = stmt.where(Source.id == task_id)
            sources = list((await self.db.execute(stmt)).scalars().all())
            trace_map = await self._load_trace_map(
                run_type="source_ingest",
                field_name="task_id",
                ids=[source.id for source in sources],
            )
            for source in sources:
                trace_id = trace_map.get(source.id)
                items.append({
                    "kind": "source_ingest",
                    "id": str(source.id),
                    "status": normalize_workload_status(source.status),
                    "message": source.summary or source.title or "source ingest failed",
                    "created_at": source.updated_at,
                    "notebook_id": str(source.notebook_id),
                    "trace_id": trace_id,
                    "trace_available": trace_id is not None,
                    "trace_missing_reason": None if trace_id else "legacy_source_ingest_without_trace",
                })

        items.sort(key=lambda item: item["created_at"], reverse=True)
        for item in items:
            item["created_at"] = item["created_at"].isoformat()
        return {"items": items}

    async def list_workers(self) -> list[dict[str, Any]]:
        result = await self.db.execute(select(WorkerHeartbeat).order_by(WorkerHeartbeat.component.asc()))
        heartbeats = list(result.scalars().all())
        return [
            {
                "component": heartbeat.component,
                "instance_id": heartbeat.instance_id,
                "hostname": heartbeat.hostname,
                "pid": heartbeat.pid,
                "status": classify_worker_status(heartbeat.last_seen_at),
                "last_seen_at": heartbeat.last_seen_at.isoformat(),
                "metadata": heartbeat.metadata_json or {},
            }
            for heartbeat in heartbeats
        ]

    async def list_workloads(
        self,
        *,
        kind: str | None = None,
        status: str | None = None,
        user_id: uuid.UUID | None = None,
        conversation_id: uuid.UUID | None = None,
        generation_id: uuid.UUID | None = None,
        task_id: uuid.UUID | None = None,
        task_run_id: uuid.UUID | None = None,
        notebook_id: uuid.UUID | None = None,
        offset: int = 0,
        limit: int = 20,
    ) -> dict[str, Any]:
        summary: list[dict[str, Any]] = []
        items: list[dict[str, Any]] = []

        if kind in (None, "chat_generation"):
            chat_items = await self._build_chat_generation_items(
                status=status,
                user_id=user_id,
                conversation_id=conversation_id,
                generation_id=generation_id,
            )
            summary.append(self._summarize_workload("chat_generation", chat_items))
            items.extend(chat_items)
        if kind in (None, "research_task"):
            research_items = await self._build_research_items(
                status=status,
                user_id=user_id,
                conversation_id=conversation_id,
                task_id=task_id,
                notebook_id=notebook_id,
            )
            summary.append(self._summarize_workload("research_task", research_items))
            items.extend(research_items)
        if kind in (None, "scheduled_task_run"):
            scheduled_items = await self._build_scheduled_items(
                status=status,
                user_id=user_id,
                task_id=task_id,
                task_run_id=task_run_id,
            )
            summary.append(self._summarize_workload("scheduled_task_run", scheduled_items))
            items.extend(scheduled_items)
        if kind in (None, "source_ingest"):
            ingest_items = await self._build_source_ingest_items(
                status=status,
                user_id=user_id,
                task_id=task_id,
                notebook_id=notebook_id,
            )
            summary.append(self._summarize_workload("source_ingest", ingest_items))
            items.extend(ingest_items)

        items.sort(key=lambda item: item["started_at"], reverse=True)
        total = len(items)
        page_items = items[offset: offset + limit]
        for item in page_items:
            item["started_at"] = item["started_at"].isoformat()
            if item.get("finished_at"):
                item["finished_at"] = item["finished_at"].isoformat()
        return {"summary": summary, "items": page_items, "total": total}

    async def _build_chat_generation_items(
        self,
        *,
        status: str | None,
        user_id: uuid.UUID | None,
        conversation_id: uuid.UUID | None,
        generation_id: uuid.UUID | None,
    ) -> list[dict[str, Any]]:
        stmt = select(MessageGeneration).order_by(MessageGeneration.started_at.desc()).limit(100)
        if user_id is not None:
            stmt = stmt.where(MessageGeneration.user_id == user_id)
        if conversation_id is not None:
            stmt = stmt.where(MessageGeneration.conversation_id == conversation_id)
        if generation_id is not None:
            stmt = stmt.where(MessageGeneration.id == generation_id)
        result = await self.db.execute(stmt)
        rows = list(result.scalars().all())
        trace_map = await self._load_trace_map(
            run_type="chat_generation",
            field_name="generation_id",
            ids=[row.id for row in rows],
        )
        items: list[dict[str, Any]] = []
        threshold = WORKLOAD_THRESHOLDS["chat_generation"].max_age
        requested_status = normalize_workload_status(status) if status else None
        for row in rows:
            base_status = normalize_workload_status(row.status)
            stuck = base_status == "running" and utcnow() - ensure_utc(row.started_at) > threshold
            normalized_status = "stuck" if stuck else base_status
            if requested_status and normalized_status != requested_status:
                continue
            trace_id = trace_map.get(row.id)
            items.append({
                "kind": "chat_generation",
                "id": str(row.id),
                "trace_id": trace_id,
                "trace_available": trace_id is not None,
                "trace_missing_reason": None if trace_id else "trace_not_found",
                "status": normalized_status,
                "started_at": row.started_at,
                "finished_at": row.completed_at,
                "conversation_id": str(row.conversation_id),
                "task_id": None,
                "task_run_id": None,
                "message": row.error_message,
                "stuck": stuck,
            })
        return items

    async def _build_research_items(
        self,
        *,
        status: str | None,
        user_id: uuid.UUID | None,
        conversation_id: uuid.UUID | None,
        task_id: uuid.UUID | None,
        notebook_id: uuid.UUID | None,
    ) -> list[dict[str, Any]]:
        stmt = select(ResearchTask).order_by(ResearchTask.created_at.desc()).limit(100)
        if user_id is not None:
            stmt = stmt.where(ResearchTask.user_id == user_id)
        if conversation_id is not None:
            stmt = stmt.where(ResearchTask.conversation_id == conversation_id)
        if task_id is not None:
            stmt = stmt.where(ResearchTask.id == task_id)
        if notebook_id is not None:
            stmt = stmt.where(ResearchTask.notebook_id == str(notebook_id))
        result = await self.db.execute(stmt)
        rows = list(result.scalars().all())
        trace_map = await self._load_trace_map(
            run_type="research_task",
            field_name="task_id",
            ids=[row.id for row in rows],
        )
        items: list[dict[str, Any]] = []
        threshold = WORKLOAD_THRESHOLDS["research_task"].max_age
        requested_status = normalize_workload_status(status) if status else None
        for row in rows:
            base_status = normalize_workload_status(row.status)
            stuck = base_status == "running" and utcnow() - ensure_utc(row.created_at) > threshold
            normalized_status = "stuck" if stuck else base_status
            if requested_status and normalized_status != requested_status:
                continue
            trace_id = trace_map.get(row.id)
            items.append({
                "kind": "research_task",
                "id": str(row.id),
                "trace_id": trace_id,
                "trace_available": trace_id is not None,
                "trace_missing_reason": None if trace_id else "trace_not_found",
                "status": normalized_status,
                "started_at": row.created_at,
                "finished_at": row.completed_at,
                "conversation_id": str(row.conversation_id) if row.conversation_id else None,
                "task_id": str(row.id),
                "task_run_id": None,
                "message": row.error_message,
                "stuck": stuck,
            })
        return items

    async def _build_scheduled_items(
        self,
        *,
        status: str | None,
        user_id: uuid.UUID | None,
        task_id: uuid.UUID | None,
        task_run_id: uuid.UUID | None,
    ) -> list[dict[str, Any]]:
        stmt = (
            select(ScheduledTaskRun, ScheduledTask.name)
            .join(ScheduledTask, ScheduledTaskRun.task_id == ScheduledTask.id)
            .order_by(ScheduledTaskRun.started_at.desc())
            .limit(100)
        )
        if user_id is not None:
            stmt = stmt.where(ScheduledTask.user_id == user_id)
        if task_id is not None:
            stmt = stmt.where(ScheduledTaskRun.task_id == task_id)
        if task_run_id is not None:
            stmt = stmt.where(ScheduledTaskRun.id == task_run_id)
        result = await self.db.execute(stmt)
        rows = list(result.all())
        trace_map = await self._load_trace_map(
            run_type="scheduled_task_run",
            field_name="task_run_id",
            ids=[row.id for row, _ in rows],
        )
        items: list[dict[str, Any]] = []
        threshold = WORKLOAD_THRESHOLDS["scheduled_task_run"].max_age
        requested_status = normalize_workload_status(status) if status else None
        for row, task_name in rows:
            base_status = normalize_workload_status(row.status)
            stuck = base_status == "running" and utcnow() - ensure_utc(row.started_at) > threshold
            normalized_status = "stuck" if stuck else base_status
            if requested_status and normalized_status != requested_status:
                continue
            trace_id = trace_map.get(row.id)
            items.append({
                "kind": "scheduled_task_run",
                "id": str(row.id),
                "title": task_name,
                "trace_id": trace_id,
                "trace_available": trace_id is not None,
                "trace_missing_reason": None if trace_id else "trace_not_found",
                "status": normalized_status,
                "started_at": row.started_at,
                "finished_at": row.finished_at,
                "conversation_id": None,
                "task_id": str(row.task_id),
                "task_run_id": str(row.id),
                "message": row.error_message,
                "stuck": stuck,
            })
        return items

    async def _build_source_ingest_items(
        self,
        *,
        status: str | None,
        user_id: uuid.UUID | None,
        task_id: uuid.UUID | None,
        notebook_id: uuid.UUID | None,
    ) -> list[dict[str, Any]]:
        stmt = select(Source).order_by(Source.updated_at.desc()).limit(100)
        if user_id is not None:
            stmt = stmt.join(Notebook, Source.notebook_id == Notebook.id).where(Notebook.user_id == user_id)
        if notebook_id is not None:
            stmt = stmt.where(Source.notebook_id == notebook_id)
        if task_id is not None:
            stmt = stmt.where(Source.id == task_id)
        result = await self.db.execute(stmt)
        rows = list(result.scalars().all())
        trace_map = await self._load_trace_map(
            run_type="source_ingest",
            field_name="task_id",
            ids=[row.id for row in rows],
        )
        items: list[dict[str, Any]] = []
        threshold = WORKLOAD_THRESHOLDS["source_ingest"].max_age
        requested_status = normalize_workload_status(status) if status else None
        for row in rows:
            base_status = normalize_workload_status(row.status)
            stuck = base_status == "running" and utcnow() - ensure_utc(row.updated_at) > threshold
            normalized_status = "stuck" if stuck else base_status
            if requested_status and normalized_status != requested_status:
                continue
            trace_id = trace_map.get(row.id)
            items.append({
                "kind": "source_ingest",
                "id": str(row.id),
                "trace_id": trace_id,
                "trace_available": trace_id is not None,
                "trace_missing_reason": None if trace_id else "legacy_source_ingest_without_trace",
                "status": normalized_status,
                "started_at": row.created_at,
                "finished_at": row.updated_at if normalized_status in {"succeeded", "failed"} else None,
                "conversation_id": None,
                "task_id": str(row.id),
                "task_run_id": None,
                "message": row.summary or row.title,
                "stuck": stuck,
            })
        return items

    def _apply_run_filters(
        self,
        stmt: Select[tuple[ObservabilityRun]],
        *,
        run_type: str | None,
        status: str | None,
        user_id: uuid.UUID | None,
        conversation_id: uuid.UUID | None,
        generation_id: uuid.UUID | None,
        task_id: uuid.UUID | None,
        task_run_id: uuid.UUID | None,
        notebook_id: uuid.UUID | None,
    ) -> Select[tuple[ObservabilityRun]]:
        if run_type:
            stmt = stmt.where(ObservabilityRun.run_type == run_type)
        else:
            stmt = stmt.where(ObservabilityRun.run_type.in_(DEFAULT_TRACE_RUN_TYPES))
        if status:
            stmt = stmt.where(ObservabilityRun.status.in_(build_observability_status_filter(status)))
        if user_id is not None:
            stmt = stmt.where(ObservabilityRun.user_id == user_id)
        if conversation_id is not None:
            stmt = stmt.where(ObservabilityRun.conversation_id == conversation_id)
        if generation_id is not None:
            stmt = stmt.where(ObservabilityRun.generation_id == generation_id)
        if task_id is not None:
            stmt = stmt.where(ObservabilityRun.task_id == task_id)
        if task_run_id is not None:
            stmt = stmt.where(ObservabilityRun.task_run_id == task_run_id)
        if notebook_id is not None:
            stmt = stmt.where(ObservabilityRun.notebook_id == notebook_id)
        return stmt

    async def _load_trace_map(
        self,
        *,
        run_type: str,
        field_name: str,
        ids: list[uuid.UUID],
    ) -> dict[uuid.UUID, str]:
        if not ids:
            return {}

        column = getattr(ObservabilityRun, field_name)
        result = await self.db.execute(
            select(column, ObservabilityRun.trace_id, ObservabilityRun.started_at, ObservabilityRun.id)
            .where(
                ObservabilityRun.run_type == run_type,
                column.in_(ids),
            )
            .order_by(column.asc(), ObservabilityRun.started_at.desc(), ObservabilityRun.id.desc())
        )
        mapping: dict[uuid.UUID, str] = {}
        for row_id, trace_id, _, _ in result.all():
            if row_id is None or row_id in mapping:
                continue
            mapping[row_id] = trace_id
        return mapping

    async def _load_runs(self, stmt: Select[tuple[ObservabilityRun]]) -> list[ObservabilityRun]:
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def _serialize_run(self, run: ObservabilityRun) -> dict[str, Any]:
        return {
            "id": str(run.id),
            "trace_id": run.trace_id,
            "run_type": run.run_type,
            "name": run.name,
            "status": normalize_observability_status(run.status),
            "user_id": str(run.user_id) if run.user_id else None,
            "conversation_id": str(run.conversation_id) if run.conversation_id else None,
            "generation_id": str(run.generation_id) if run.generation_id else None,
            "task_id": str(run.task_id) if run.task_id else None,
            "task_run_id": str(run.task_run_id) if run.task_run_id else None,
            "notebook_id": str(run.notebook_id) if run.notebook_id else None,
            "duration_ms": run.duration_ms,
            "error_message": run.error_message,
            "metadata": run.metadata_json or {},
            "started_at": run.started_at.isoformat(),
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        }

    def _serialize_span(self, span: ObservabilitySpan) -> dict[str, Any]:
        return {
            "id": str(span.id),
            "run_id": str(span.run_id),
            "parent_span_id": str(span.parent_span_id) if span.parent_span_id else None,
            "trace_id": span.trace_id,
            "span_name": span.span_name,
            "component": span.component or "worker",
            "span_kind": span.span_kind or "phase",
            "status": normalize_observability_status(span.status),
            "duration_ms": span.duration_ms,
            "error_message": span.error_message,
            "metadata": span.metadata_json or {},
            "started_at": span.started_at.isoformat(),
            "finished_at": span.finished_at.isoformat() if span.finished_at else None,
        }

    def _serialize_llm_call(self, call: ObservabilityLLMCall) -> dict[str, Any]:
        return {
            "id": str(call.id),
            "run_id": str(call.run_id),
            "trace_id": call.trace_id,
            "call_type": call.call_type,
            "provider": call.provider,
            "model": call.model,
            "status": normalize_observability_status(call.status),
            "finish_reason": call.finish_reason,
            "input_tokens": call.input_tokens,
            "output_tokens": call.output_tokens,
            "reasoning_tokens": call.reasoning_tokens,
            "cached_tokens": call.cached_tokens,
            "ttft_ms": call.ttft_ms,
            "duration_ms": call.duration_ms,
            "error_message": call.error_message,
            "prompt_snapshot": call.prompt_snapshot or {},
            "response_snapshot": call.response_snapshot or {},
            "metadata": call.metadata_json or {},
            "started_at": call.started_at.isoformat(),
            "finished_at": call.finished_at.isoformat() if call.finished_at else None,
        }

    def _serialize_tool_call(self, call: ObservabilityToolCall) -> dict[str, Any]:
        return {
            "id": str(call.id),
            "run_id": str(call.run_id),
            "trace_id": call.trace_id,
            "tool_name": call.tool_name,
            "status": normalize_observability_status(call.status),
            "cache_hit": call.cache_hit,
            "result_count": call.result_count,
            "followup_tool_hint": call.followup_tool_hint,
            "duration_ms": call.duration_ms,
            "error_message": call.error_message,
            "input_snapshot": call.input_snapshot or {},
            "output_snapshot": call.output_snapshot or {},
            "metadata": call.metadata_json or {},
            "started_at": call.started_at.isoformat(),
            "finished_at": call.finished_at.isoformat() if call.finished_at else None,
        }

    def _summarize_workload(self, kind: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "kind": kind,
            "running_count": sum(1 for item in items if item["status"] == "running"),
            "stuck_count": sum(1 for item in items if item["status"] == "stuck"),
            "failed_count": sum(1 for item in items if item["status"] == "failed"),
        }


async def heartbeat_loop(component: str, stop_event: asyncio.Event) -> None:
    interval = max(5, settings.monitoring_heartbeat_interval_seconds)
    while not stop_event.is_set():
        try:
            async with AsyncSessionLocal() as db:
                await touch_worker_heartbeat(component, db=db)
                await db.commit()
        except Exception:
            logger.exception("Failed to update %s heartbeat", component)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue


def bind_trace_and_run(trace_id: str | None, run_id: uuid.UUID | None) -> tuple[Any, Any]:
    trace_token = set_trace_id(trace_id)
    run_token = set_observability_run_id(str(run_id) if run_id else None)
    return trace_token, run_token


def reset_trace_and_run(trace_token: Any, run_token: Any) -> None:
    reset_observability_run_id(run_token)
    reset_trace_id(trace_token)
