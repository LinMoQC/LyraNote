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
    await getTraces("48h", "chat_generation", "done", "cursor-1");

    expect(http.get).toHaveBeenNthCalledWith(1, MONITORING.OVERVIEW, { params: { window: "24h" } });
    expect(http.get).toHaveBeenNthCalledWith(2, MONITORING.TRACES, {
      params: {
        window: "48h",
        type: "chat_generation",
        status: "done",
        cursor: "cursor-1",
        limit: 20,
      },
    });
  });

  it("requests detail, failures, workers, and workloads from their endpoints", async () => {
    http.get.mockResolvedValue({});

    await getTraceDetail("trace-1");
    await getFailures("12h", "research_task");
    await getWorkers();
    await getWorkloads("scheduled_task_run", "stuck");

    expect(http.get).toHaveBeenNthCalledWith(1, MONITORING.traceDetail("trace-1"));
    expect(http.get).toHaveBeenNthCalledWith(2, MONITORING.FAILURES, {
      params: { window: "12h", kind: "research_task" },
    });
    expect(http.get).toHaveBeenNthCalledWith(3, MONITORING.WORKERS);
    expect(http.get).toHaveBeenNthCalledWith(4, MONITORING.WORKLOADS, {
      params: { kind: "scheduled_task_run", status: "stuck", offset: 0, limit: 20 },
    });
  });
});
