import { beforeEach, describe, expect, it } from "vitest"

import { useDesktopJobsStore } from "@/store/use-desktop-jobs-store"

describe("use-desktop-jobs-store", () => {
  beforeEach(() => {
    useDesktopJobsStore.getState().clear()
  })

  it("hydrates and sorts desktop jobs by updated_at descending", () => {
    useDesktopJobsStore.getState().setJobs([
      {
        id: "job-1",
        kind: "import",
        state: "queued",
        label: "older",
        progress: 0,
        created_at: "2026-04-17T00:00:00Z",
        updated_at: "2026-04-17T00:00:00Z",
      },
      {
        id: "job-2",
        kind: "import",
        state: "running",
        label: "newer",
        progress: 10,
        created_at: "2026-04-17T00:00:00Z",
        updated_at: "2026-04-17T00:05:00Z",
      },
    ])

    expect(useDesktopJobsStore.getState().jobs.map((job) => job.id)).toEqual([
      "job-2",
      "job-1",
    ])
  })

  it("merges job progress events into existing jobs", () => {
    useDesktopJobsStore.getState().setJobs([
      {
        id: "job-3",
        kind: "import",
        state: "queued",
        label: "索引资料：paper.pdf",
        progress: 0,
        message: "queued",
        resource_id: "source-3",
        created_at: "2026-04-17T01:00:00Z",
        updated_at: "2026-04-17T01:00:00Z",
      },
    ])

    useDesktopJobsStore.getState().applyProgressEvent({
      type: "job.progress",
      occurred_at: "2026-04-17T01:02:00Z",
      payload: {
        id: "job-3",
        kind: "import",
        state: "running",
        progress: 42,
        message: "processing",
        resource_id: "source-3",
      },
    })

    expect(useDesktopJobsStore.getState().jobs).toEqual([
      expect.objectContaining({
        id: "job-3",
        state: "running",
        progress: 42,
        message: "processing",
        label: "索引资料：paper.pdf",
        updated_at: "2026-04-17T01:02:00Z",
      }),
    ])
  })
})
