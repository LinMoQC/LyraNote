import { beforeEach, describe, expect, it, vi } from "vitest";

import { MONITORING } from "@/lib/api-routes";
import {
  getFailures,
  getOverview,
  getTraceDetail,
  getTraces,
  getWorkers,
  getWorkloads,
} from "@/services/monitoring-service";
import { http, resetHttpClientMocks } from "@test/mocks/http-client";

vi.mock("@/lib/http-client", () => import("@test/mocks/http-client"));

describe("monitoring-service", () => {
  beforeEach(() => {
    resetHttpClientMocks();
  });

  it("requests overview and traces with query params", async () => {
    http.get.mockResolvedValueOnce({ window: "24h" }).mockResolvedValueOnce({ items: [], next_cursor: null });

    await getOverview("24h");
    await getTraces({
      window: "48h",
      type: "chat_generation",
      status: "succeeded",
      cursor: "cursor-1",
      user_id: "user-1",
      conversation_id: "conv-1",
    });

    expect(http.get).toHaveBeenNthCalledWith(1, MONITORING.OVERVIEW, { params: { window: "24h" } });
    expect(http.get).toHaveBeenNthCalledWith(2, MONITORING.TRACES, {
      params: {
        window: "48h",
        type: "chat_generation",
        status: "succeeded",
        cursor: "cursor-1",
        limit: 20,
        user_id: "user-1",
        conversation_id: "conv-1",
        generation_id: undefined,
        task_id: undefined,
        task_run_id: undefined,
        notebook_id: undefined,
      },
    });
  });

  it("requests detail, failures, workers, and workloads from their endpoints", async () => {
    http.get.mockResolvedValue({});

    await getTraceDetail("trace-1");
    await getFailures({ window: "12h", kind: "research_task", notebook_id: "nb-1" });
    await getWorkers();
    await getWorkloads({ kind: "scheduled_task_run", status: "stuck", offset: 24, limit: 12, task_run_id: "run-1" });

    expect(http.get).toHaveBeenNthCalledWith(1, MONITORING.traceDetail("trace-1"));
    expect(http.get).toHaveBeenNthCalledWith(2, MONITORING.FAILURES, {
      params: {
        window: "12h",
        kind: "research_task",
        user_id: undefined,
        conversation_id: undefined,
        generation_id: undefined,
        task_id: undefined,
        task_run_id: undefined,
        notebook_id: "nb-1",
      },
    });
    expect(http.get).toHaveBeenNthCalledWith(3, MONITORING.WORKERS);
    expect(http.get).toHaveBeenNthCalledWith(4, MONITORING.WORKLOADS, {
      params: {
        kind: "scheduled_task_run",
        status: "stuck",
        offset: 24,
        limit: 12,
        user_id: undefined,
        conversation_id: undefined,
        generation_id: undefined,
        task_id: undefined,
        task_run_id: "run-1",
        notebook_id: undefined,
      },
    });
  });
});
