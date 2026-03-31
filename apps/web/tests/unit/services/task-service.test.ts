import { beforeEach, describe, expect, it, vi } from "vitest";

import { TASKS } from "@/lib/api-routes";
import {
  createTask,
  getTaskRuns,
  runTaskManually,
  updateTask,
} from "@/services/task-service";
import { buildScheduledTask, buildTaskRun } from "@test/fixtures/task.factory";
import { http, resetHttpClientMocks } from "@test/mocks/http-client";

vi.mock("@/lib/http-client", () => import("@test/mocks/http-client"));

describe("task-service", () => {
  beforeEach(() => {
    resetHttpClientMocks();
  });

  it("creates tasks through the list endpoint", async () => {
    const task = buildScheduledTask({ name: "planet-ai" });
    http.post.mockResolvedValue(task);

    await expect(
      createTask({
        name: "planet-ai",
        topic: "AI",
        delivery: "note",
      }),
    ).resolves.toEqual(task);

    expect(http.post).toHaveBeenCalledWith(TASKS.LIST, {
      name: "planet-ai",
      topic: "AI",
      delivery: "note",
    });
  });

  it("patches task updates through the detail endpoint", async () => {
    const task = buildScheduledTask({ enabled: false });
    http.patch.mockResolvedValue(task);

    await expect(
      updateTask("task-1", { enabled: false, name: "paused-report" }),
    ).resolves.toEqual(task);

    expect(http.patch).toHaveBeenCalledWith(TASKS.detail("task-1"), {
      enabled: false,
      name: "paused-report",
    });
  });

  it("runs a task manually and fetches its history", async () => {
    http.post.mockResolvedValue({ status: "queued", message: "Task queued" });
    http.get.mockResolvedValue([buildTaskRun()]);

    await expect(runTaskManually("task-1")).resolves.toEqual({
      status: "queued",
      message: "Task queued",
    });
    await expect(getTaskRuns("task-1")).resolves.toEqual([buildTaskRun()]);

    expect(http.post).toHaveBeenCalledWith(TASKS.run("task-1"));
    expect(http.get).toHaveBeenCalledWith(TASKS.runs("task-1"));
  });
});
