import { beforeEach, describe, expect, it, vi } from "vitest"

const { httpMock } = vi.hoisted(() => ({
  httpMock: {
    get: vi.fn(),
    post: vi.fn(),
    fetchJson: vi.fn(),
  },
}))

vi.mock("@/lib/api-client", () => ({
  getDesktopHttpClient: () => httpMock,
}))

import {
  cancelDesktopJob,
  createWatchFolder,
  deleteWatchFolder,
  getDesktopJobs,
  inspectLocalFile,
  getRecentImports,
  getWatchFolders,
  searchLocalKnowledge,
} from "@/services/desktop-service"

describe("desktop-service", () => {
  beforeEach(() => {
    httpMock.get.mockReset()
    httpMock.post.mockReset()
    httpMock.fetchJson.mockReset()
  })

  it("loads jobs, watch folders, and recent imports from desktop endpoints", async () => {
    httpMock.get
      .mockResolvedValueOnce({ items: [{ id: "job-1", label: "Import", state: "queued" }] })
      .mockResolvedValueOnce({ items: [{ id: "folder-1", path: "/tmp/inbox", is_active: true }] })
      .mockResolvedValueOnce({ items: [{ path: "/tmp/demo.pdf", imported_at: "2026-04-17T00:00:00Z" }] })

    await expect(getDesktopJobs()).resolves.toEqual([{ id: "job-1", label: "Import", state: "queued" }])
    await expect(getWatchFolders()).resolves.toEqual([{ id: "folder-1", path: "/tmp/inbox", is_active: true }])
    await expect(getRecentImports()).resolves.toEqual([{ path: "/tmp/demo.pdf", imported_at: "2026-04-17T00:00:00Z" }])

    expect(httpMock.get).toHaveBeenNthCalledWith(1, "/jobs")
    expect(httpMock.get).toHaveBeenNthCalledWith(2, "/watch-folders")
    expect(httpMock.get).toHaveBeenNthCalledWith(3, "/recent-imports")
  })

  it("creates, cancels, and deletes watch-folder resources with the desktop client", async () => {
    httpMock.post
      .mockResolvedValueOnce({ id: "folder-2", path: "/tmp/reading" })
      .mockResolvedValueOnce({ cancelled: true, reason: null })
    httpMock.fetchJson.mockResolvedValue(undefined)

    await expect(createWatchFolder("/tmp/reading")).resolves.toEqual({
      id: "folder-2",
      path: "/tmp/reading",
    })
    await expect(cancelDesktopJob("job-22")).resolves.toEqual({ cancelled: true, reason: null })
    await expect(deleteWatchFolder("folder-2")).resolves.toBeUndefined()

    expect(httpMock.post).toHaveBeenNthCalledWith(1, "/watch-folders", { path: "/tmp/reading" })
    expect(httpMock.post).toHaveBeenNthCalledWith(2, "/jobs/job-22/cancel")
    expect(httpMock.fetchJson).toHaveBeenCalledWith("/watch-folders", {
      method: "DELETE",
      body: JSON.stringify({ id: "folder-2" }),
    })
  })

  it("inspects local files through the desktop duplicate-detection endpoint", async () => {
    httpMock.post.mockResolvedValue({
      state: "duplicate",
      path: "/tmp/paper-b.pdf",
      source_id: "source-1",
      matched_path: "/tmp/paper-a.pdf",
      matched_title: "paper-a.pdf",
      sha256: "digest-1",
    })

    await expect(inspectLocalFile("/tmp/paper-b.pdf", "digest-1")).resolves.toEqual(
      expect.objectContaining({
        state: "duplicate",
        source_id: "source-1",
      }),
    )

    expect(httpMock.post).toHaveBeenCalledWith("/local-files/inspect", {
      path: "/tmp/paper-b.pdf",
      sha256: "digest-1",
    })
  })

  it("searches local desktop knowledge with query params", async () => {
    httpMock.get.mockResolvedValue({
      query: "transformer",
      mode: "fts5",
      items: [{ chunk_id: "chunk-1", source_id: "source-1", excerpt: "transformer block" }],
    })

    await expect(searchLocalKnowledge("transformer", { limit: 4 })).resolves.toEqual(
      expect.objectContaining({
        query: "transformer",
        items: [expect.objectContaining({ chunk_id: "chunk-1" })],
      }),
    )

    expect(httpMock.get).toHaveBeenCalledWith("/search/local", {
      params: {
        query: "transformer",
        limit: 4,
      },
    })
  })
})
