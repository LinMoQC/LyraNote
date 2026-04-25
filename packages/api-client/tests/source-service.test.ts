import { beforeEach, describe, expect, it, vi } from "vitest"

import { createSourceService } from "../src/services/sources"
import { SOURCES } from "../src/lib/routes"
import type { HttpClient } from "../src/lib/client"

describe("source service", () => {
  const http = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    fetchJson: vi.fn(),
  } as unknown as HttpClient

  beforeEach(() => {
    vi.mocked(http.get).mockReset()
    vi.mocked(http.post).mockReset()
    vi.mocked(http.patch).mockReset()
    vi.mocked(http.delete).mockReset()
  })

  it("maps global source lists through shared mappers", async () => {
    vi.mocked(http.get).mockResolvedValue([
      {
        id: "source-1",
        notebook_id: "global",
        title: "Global Source",
        type: "md",
        summary: "summary",
        status: "unknown-status",
      },
    ])

    const service = createSourceService(http)

    await expect(service.getGlobalSources()).resolves.toEqual([
      expect.objectContaining({
        id: "source-1",
        notebookId: "global",
        type: "doc",
        status: "processing",
      }),
    ])
    expect(http.get).toHaveBeenCalledWith(SOURCES.GLOBAL)
  })

  it("maps paginated source responses and preserves query params", async () => {
    vi.mocked(http.get).mockResolvedValue({
      items: [
        {
          id: "source-2",
          notebook_id: "notebook-1",
          title: "Paged Source",
          type: "web",
          summary: "summary",
          status: "indexed",
        },
      ],
      total: 3,
      offset: 20,
      limit: 10,
      has_more: true,
    })

    const service = createSourceService(http)

    await expect(
      service.getSourcesPage({ offset: 20, limit: 10, type: "web", search: "agent" }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "source-2",
          notebookId: "notebook-1",
          type: "web",
        }),
      ],
      total: 3,
      offset: 20,
      limit: 10,
      hasMore: true,
    })

    expect(http.get).toHaveBeenCalledWith(SOURCES.ALL, {
      params: { offset: 20, limit: 10, type: "web", search: "agent" },
    })
  })

  it("routes source updates and rechunk options through stable endpoints", async () => {
    vi.mocked(http.patch).mockResolvedValue(undefined)
    vi.mocked(http.post).mockResolvedValue(undefined)

    const service = createSourceService(http)

    await service.updateSource("source-3", { notebook_id: "notebook-2", title: "Updated" })
    await service.rechunk("source-3", {
      strategy: "custom",
      chunk_size: 1200,
      chunk_overlap: 200,
      splitter_type: "recursive",
    })

    expect(http.patch).toHaveBeenCalledWith(SOURCES.detail("source-3"), {
      notebook_id: "notebook-2",
      title: "Updated",
    })
    expect(http.post).toHaveBeenCalledWith(SOURCES.rechunk("source-3"), {
      strategy: "custom",
      chunk_size: 1200,
      chunk_overlap: 200,
      splitter_type: "recursive",
    })
  })
})
