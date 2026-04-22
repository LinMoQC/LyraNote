import { beforeEach, describe, expect, it, vi } from "vitest"

const { httpMock, sourceServiceMock } = vi.hoisted(() => ({
  httpMock: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    fetchJson: vi.fn(),
  },
  sourceServiceMock: {
    deleteSource: vi.fn(),
    rechunk: vi.fn(),
    getChunks: vi.fn(),
  },
}))

vi.mock("@/lib/api-client", () => ({
  getDesktopHttpClient: () => httpMock,
  getDesktopSourceService: () => sourceServiceMock,
}))

import {
  deleteSource,
  getAllSources,
  importGlobalPath,
  importGlobalUrl,
  rechunkSource,
  uploadGlobalSource,
} from "@/services/source-service"

describe("source-service", () => {
  beforeEach(() => {
    httpMock.get.mockReset()
    httpMock.post.mockReset()
    httpMock.delete.mockReset()
    httpMock.fetchJson.mockReset()
    sourceServiceMock.deleteSource.mockReset()
    sourceServiceMock.rechunk.mockReset()
    sourceServiceMock.getChunks.mockReset()
  })

  it("maps paginated source responses to desktop source contracts", async () => {
    httpMock.get.mockResolvedValue({
      items: [
        {
          id: "source-1",
          notebook_id: "global",
          title: "Agent Notes",
          type: "md",
          summary: "Latest findings",
          status: "unknown-status",
          url: "https://example.com",
          created_at: "2026-04-17T00:00:00.000Z",
        },
      ],
      total: 8,
      has_more: true,
    })

    await expect(getAllSources(20, 10)).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "source-1",
          notebookId: "global",
          type: "doc",
          status: "processing",
          url: "https://example.com",
          createdAt: "2026-04-17T00:00:00.000Z",
        }),
      ],
      total: 8,
      hasMore: true,
    })

    expect(httpMock.get).toHaveBeenCalledWith("/sources/all", {
      params: { offset: 20, limit: 10 },
    })
  })

  it("uses fetchJson for global uploads and preserves multipart payloads", async () => {
    httpMock.fetchJson.mockResolvedValue({
      id: "source-2",
      notebook_id: "global",
      title: "Upload",
      type: "pdf",
      summary: "",
      status: "indexed",
      created_at: "2026-04-17T01:00:00.000Z",
      url: null,
    })

    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" })
    const result = await uploadGlobalSource(file)

    expect(result).toEqual(expect.objectContaining({
      id: "source-2",
      type: "pdf",
      createdAt: "2026-04-17T01:00:00.000Z",
    }))
    expect(httpMock.fetchJson).toHaveBeenCalledWith(
      "/sources/global/upload",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    )
  })

  it("routes URL import, delete, and rechunk through the shared desktop client", async () => {
    httpMock.post.mockResolvedValue({
      id: "source-3",
      notebook_id: "global",
      title: "Imported",
      type: "web",
      summary: "",
      status: "processing",
      created_at: "2026-04-17T02:00:00.000Z",
      url: "https://example.com/agent",
    })
    sourceServiceMock.deleteSource.mockResolvedValue(undefined)
    sourceServiceMock.rechunk.mockResolvedValue(undefined)

    await expect(importGlobalUrl("https://example.com/agent")).resolves.toEqual(
      expect.objectContaining({
        id: "source-3",
        type: "web",
      }),
    )
    await deleteSource("source-3")
    await rechunkSource("source-3")

    expect(httpMock.post).toHaveBeenNthCalledWith(1, "/sources/global/import-url", {
      url: "https://example.com/agent",
    })
    expect(sourceServiceMock.deleteSource).toHaveBeenCalledWith("source-3")
    expect(sourceServiceMock.rechunk).toHaveBeenCalledWith("source-3")
  })

  it("routes native-path imports through the desktop runtime API", async () => {
    httpMock.post.mockResolvedValue({
      id: "source-4",
      notebook_id: "global",
      title: "paper.pdf",
      type: "pdf",
      summary: "",
      status: "pending",
      created_at: "2026-04-17T03:00:00.000Z",
      url: null,
    })

    await expect(importGlobalPath("/Users/demo/Desktop/paper.pdf", "digest-1")).resolves.toEqual(
      expect.objectContaining({
        id: "source-4",
        type: "pdf",
      }),
    )

    expect(httpMock.post).toHaveBeenCalledWith("/sources/global/import-path", {
      path: "/Users/demo/Desktop/paper.pdf",
      sha256: "digest-1",
    })
  })
})
