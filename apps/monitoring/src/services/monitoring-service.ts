import { MONITORING } from "@/lib/api-routes";
import { http } from "@/lib/http-client";

export interface MonitoringOverview {
  window: string;
  requests: {
    total: number;
    errors_5xx: number;
    p50_ms: number | null;
    p95_ms: number | null;
  };
  chat: {
    total: number;
    success_rate: number | null;
  };
  workloads: {
    running: number;
    stuck: number;
  };
  workers: {
    total: number;
    healthy: number;
    stale: number;
    down: number;
  };
}

export interface TraceRun {
  id: string;
  trace_id: string;
  run_type: string;
  name: string;
  status: string;
  conversation_id: string | null;
  generation_id: string | null;
  task_id: string | null;
  task_run_id: string | null;
  notebook_id: string | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
}

export interface TraceSpan {
  id: string;
  run_id: string;
  trace_id: string;
  span_name: string;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
}

export interface TraceListResponse {
  items: TraceRun[];
  total: number;
  next_cursor: string | null;
}

export interface TraceDetail {
  trace_id: string;
  runs: TraceRun[];
  spans: TraceSpan[];
  llm_calls: TraceLLMCall[];
  tool_calls: TraceToolCall[];
  summary: TraceSummary;
}

export interface TextSnapshot {
  raw_preview: string;
  char_count: number;
  sha256: string;
  redaction_applied: boolean;
  truncated: boolean;
}

export interface TraceLLMCall {
  id: string;
  run_id: string;
  trace_id: string;
  call_type: string;
  provider: string | null;
  model: string | null;
  status: string;
  finish_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  cached_tokens: number | null;
  ttft_ms: number | null;
  duration_ms: number | null;
  error_message: string | null;
  prompt_snapshot: TextSnapshot;
  response_snapshot: TextSnapshot;
  metadata: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
}

export interface TraceToolCall {
  id: string;
  run_id: string;
  trace_id: string;
  tool_name: string;
  status: string;
  cache_hit: boolean;
  result_count: number | null;
  followup_tool_hint: string | null;
  duration_ms: number | null;
  error_message: string | null;
  input_snapshot: TextSnapshot;
  output_snapshot: TextSnapshot;
  metadata: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
}

export interface TraceSummary {
  total_duration_ms: number;
  total_llm_calls: number;
  total_tool_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  final_status: string;
}

export interface FailureItem {
  kind: string;
  id: string;
  status: string;
  message: string | null;
  trace_id: string | null;
  title?: string | null;
  conversation_id?: string | null;
  notebook_id?: string | null;
  created_at: string;
}

export interface FailureList {
  items: FailureItem[];
}

export interface WorkerHeartbeat {
  component: string;
  instance_id: string;
  hostname: string;
  pid: number;
  status: string;
  last_seen_at: string;
  metadata: Record<string, unknown>;
}

export interface WorkloadSummary {
  kind: string;
  running_count: number;
  stuck_count: number;
  failed_count: number;
}

export interface WorkloadItem {
  kind: string;
  id: string;
  trace_id: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  conversation_id: string | null;
  task_id: string | null;
  task_run_id: string | null;
  title: string | null;
  message: string | null;
  stuck: boolean;
}

export interface WorkloadList {
  summary: WorkloadSummary[];
  items: WorkloadItem[];
  total: number;
}

export function getOverview(window = "24h") {
  return http.get<MonitoringOverview>(MONITORING.OVERVIEW, { params: { window } });
}

export function getTraces(window = "24h", type?: string, status?: string, cursor?: string, limit = 20) {
  return http.get<TraceListResponse>(MONITORING.TRACES, {
    params: { window, type, status, cursor, limit },
  });
}

export function getTraceDetail(traceId: string) {
  return http.get<TraceDetail>(MONITORING.traceDetail(traceId));
}

export function getFailures(window = "24h", kind?: string) {
  return http.get<FailureList>(MONITORING.FAILURES, { params: { window, kind } });
}

export function getWorkers() {
  return http.get<WorkerHeartbeat[]>(MONITORING.WORKERS);
}

export function getWorkloads(kind?: string, status?: string, offset = 0, limit = 20) {
  return http.get<WorkloadList>(MONITORING.WORKLOADS, { params: { kind, status, offset, limit } });
}
