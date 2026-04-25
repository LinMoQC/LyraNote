from __future__ import annotations

from pydantic import BaseModel


class MonitoringRequestsOut(BaseModel):
    total: int
    errors_5xx: int
    p50_ms: int | None = None
    p95_ms: int | None = None


class MonitoringChatOut(BaseModel):
    total: int
    success_rate: float | None = None


class MonitoringWorkloadsSummaryOut(BaseModel):
    running: int
    stuck: int


class MonitoringWorkersSummaryOut(BaseModel):
    total: int
    healthy: int
    stale: int
    down: int


class MonitoringOverviewOut(BaseModel):
    window: str
    requests: MonitoringRequestsOut
    chat: MonitoringChatOut
    workloads: MonitoringWorkloadsSummaryOut
    workers: MonitoringWorkersSummaryOut


class TraceRunOut(BaseModel):
    id: str
    trace_id: str
    run_type: str
    name: str
    status: str
    user_id: str | None = None
    conversation_id: str | None = None
    generation_id: str | None = None
    task_id: str | None = None
    task_run_id: str | None = None
    notebook_id: str | None = None
    duration_ms: int | None = None
    error_message: str | None = None
    metadata: dict = {}
    started_at: str
    finished_at: str | None = None


class TraceSpanOut(BaseModel):
    id: str
    run_id: str
    parent_span_id: str | None = None
    trace_id: str
    span_name: str
    component: str | None = None
    span_kind: str | None = None
    status: str
    duration_ms: int | None = None
    error_message: str | None = None
    metadata: dict = {}
    started_at: str
    finished_at: str | None = None


class TraceListOut(BaseModel):
    items: list[TraceRunOut]
    total: int = 0
    next_cursor: str | None = None


class TraceLLMCallOut(BaseModel):
    id: str
    run_id: str
    trace_id: str
    call_type: str
    provider: str | None = None
    model: str | None = None
    status: str
    finish_reason: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    reasoning_tokens: int | None = None
    cached_tokens: int | None = None
    ttft_ms: int | None = None
    duration_ms: int | None = None
    error_message: str | None = None
    prompt_snapshot: dict = {}
    response_snapshot: dict = {}
    metadata: dict = {}
    started_at: str
    finished_at: str | None = None


class TraceToolCallOut(BaseModel):
    id: str
    run_id: str
    trace_id: str
    tool_name: str
    status: str
    cache_hit: bool = False
    result_count: int | None = None
    followup_tool_hint: str | None = None
    duration_ms: int | None = None
    error_message: str | None = None
    input_snapshot: dict = {}
    output_snapshot: dict = {}
    metadata: dict = {}
    started_at: str
    finished_at: str | None = None


class TraceSummaryOut(BaseModel):
    total_duration_ms: int
    total_llm_calls: int
    total_tool_calls: int
    total_input_tokens: int
    total_output_tokens: int
    final_status: str


class TraceDetailOut(BaseModel):
    trace_id: str
    runs: list[TraceRunOut]
    spans: list[TraceSpanOut]
    llm_calls: list[TraceLLMCallOut]
    tool_calls: list[TraceToolCallOut]
    summary: TraceSummaryOut


class FailureItemOut(BaseModel):
    kind: str
    id: str
    status: str
    message: str | None = None
    trace_id: str | None = None
    trace_available: bool = False
    trace_missing_reason: str | None = None
    title: str | None = None
    conversation_id: str | None = None
    notebook_id: str | None = None
    created_at: str


class FailureListOut(BaseModel):
    items: list[FailureItemOut]


class WorkerHeartbeatOut(BaseModel):
    component: str
    instance_id: str
    hostname: str
    pid: int
    status: str
    last_seen_at: str
    metadata: dict = {}


class WorkloadSummaryOut(BaseModel):
    kind: str
    running_count: int
    stuck_count: int
    failed_count: int


class WorkloadItemOut(BaseModel):
    kind: str
    id: str
    trace_id: str | None = None
    trace_available: bool = False
    trace_missing_reason: str | None = None
    status: str
    started_at: str
    finished_at: str | None = None
    conversation_id: str | None = None
    task_id: str | None = None
    task_run_id: str | None = None
    title: str | None = None
    message: str | None = None
    stuck: bool = False


class WorkloadListOut(BaseModel):
    summary: list[WorkloadSummaryOut]
    items: list[WorkloadItemOut]
    total: int = 0
