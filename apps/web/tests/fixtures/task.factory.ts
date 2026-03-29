import type { ScheduledTask, TaskRun } from "@/services/task-service";

export function buildScheduledTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: "task-1",
    name: "daily-ai",
    description: null,
    task_type: "planet",
    schedule_cron: "0 8 * * *",
    timezone: "Asia/Shanghai",
    parameters: { topic: "AI", feed_urls: [] },
    delivery_config: { method: "note" },
    enabled: true,
    last_run_at: null,
    next_run_at: "2026-03-30T08:00:00.000Z",
    run_count: 0,
    last_result: null,
    last_error: null,
    consecutive_failures: 0,
    created_at: "2026-03-29T08:00:00.000Z",
    updated_at: "2026-03-29T08:00:00.000Z",
    ...overrides,
  };
}

export function buildTaskRun(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    id: "run-1",
    task_id: "task-1",
    status: "success",
    started_at: "2026-03-29T08:00:00.000Z",
    finished_at: "2026-03-29T08:01:00.000Z",
    duration_ms: 60_000,
    result_summary: "done",
    error_message: null,
    generated_content: null,
    sources_count: 3,
    delivery_status: { note: "created" },
    ...overrides,
  };
}
