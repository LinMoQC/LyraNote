import { create } from "zustand"

import type { DesktopJob, DesktopJobProgressEvent } from "@/types"

interface DesktopJobsStore {
  jobs: DesktopJob[]
  setJobs: (jobs: DesktopJob[]) => void
  upsertJob: (job: DesktopJob) => void
  applyProgressEvent: (event: DesktopJobProgressEvent) => void
  clear: () => void
}

function sortJobs(jobs: DesktopJob[]) {
  return [...jobs].sort((a, b) => {
    const next = Date.parse(b.updated_at)
    const current = Date.parse(a.updated_at)
    return next - current
  })
}

export const useDesktopJobsStore = create<DesktopJobsStore>((set) => ({
  jobs: [],
  setJobs: (jobs) => set({ jobs: sortJobs(jobs) }),
  upsertJob: (job) =>
    set((state) => {
      const next = state.jobs.filter((item) => item.id !== job.id)
      next.unshift(job)
      return { jobs: sortJobs(next) }
    }),
  applyProgressEvent: (event) =>
    set((state) => {
      const id = event.payload.id
      if (!id) {
        return state
      }

      const current = state.jobs.find((job) => job.id === id)
      const nextJob: DesktopJob = {
        id,
        kind: event.payload.kind ?? current?.kind ?? "import",
        state: event.payload.state ?? current?.state ?? "queued",
        label: current?.label ?? current?.message ?? "桌面任务",
        progress: event.payload.progress ?? current?.progress ?? 0,
        message: event.payload.message ?? current?.message ?? null,
        resource_id: event.payload.resource_id ?? current?.resource_id ?? null,
        created_at: current?.created_at ?? event.occurred_at,
        updated_at: event.occurred_at,
      }

      const jobs = state.jobs.filter((job) => job.id !== id)
      jobs.unshift(nextJob)
      return { jobs: sortJobs(jobs) }
    }),
  clear: () => set({ jobs: [] }),
}))
