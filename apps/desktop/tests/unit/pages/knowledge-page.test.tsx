import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const desktopBridgeMocks = vi.hoisted(() => ({
  dialogPickSources: vi.fn(),
  dialogPickWatchFolder: vi.fn(),
  notificationShow: vi.fn(),
  trayToggleWatchers: vi.fn(),
  watchFoldersSync: vi.fn(),
}))

const sourceServiceMocks = vi.hoisted(() => ({
  deleteSource: vi.fn(),
  getAllSources: vi.fn(),
  getSourceChunks: vi.fn(),
  importGlobalPath: vi.fn(),
  importGlobalUrl: vi.fn(),
  rechunkSource: vi.fn(),
}))

const desktopServiceMocks = vi.hoisted(() => ({
  cancelDesktopJob: vi.fn(),
  createWatchFolder: vi.fn(),
  deleteWatchFolder: vi.fn(),
  getRecentImports: vi.fn(),
  getWatchFolders: vi.fn(),
  inspectLocalFile: vi.fn(),
  searchLocalKnowledge: vi.fn(),
}))

const nativeFileMocks = vi.hoisted(() => ({
  computeLocalFileHash: vi.fn(),
}))

const runtimeState = vi.hoisted(() => ({
  status: { watchers_paused: false },
  setStatus: vi.fn(),
}))

vi.mock("@/lib/desktop-bridge", () => desktopBridgeMocks)
vi.mock("@/services/source-service", () => sourceServiceMocks)
vi.mock("@/services/desktop-service", () => desktopServiceMocks)
vi.mock("@/services/native-file-service", () => nativeFileMocks)
vi.mock("@/store/use-desktop-jobs-store", () => ({
  useDesktopJobsStore: (selector: (state: { jobs: never[] }) => unknown) => selector({ jobs: [] }),
}))
vi.mock("@/store/use-desktop-runtime-store", () => ({
  useDesktopRuntimeStore: (selector: (state: typeof runtimeState) => unknown) => selector(runtimeState),
}))
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}))

import { KnowledgePage } from "@/pages/knowledge/knowledge-page"

describe("KnowledgePage", () => {
  beforeEach(() => {
    desktopBridgeMocks.watchFoldersSync.mockResolvedValue(undefined)
    sourceServiceMocks.getAllSources.mockResolvedValue({
      items: [{
        id: "source-1",
        title: "Transformer Paper",
        url: null,
        type: "pdf",
        status: "indexed",
        summary: "A paper about transformer models.",
        createdAt: "2026-04-18T00:00:00Z",
      }],
      total: 1,
      hasMore: false,
    })
    sourceServiceMocks.getSourceChunks.mockResolvedValue([])
    desktopServiceMocks.getWatchFolders.mockResolvedValue([])
    desktopServiceMocks.getRecentImports.mockResolvedValue([])
    desktopServiceMocks.searchLocalKnowledge.mockResolvedValue({
      query: "transformer",
      mode: "fts5",
      items: [{
        chunk_id: "chunk-1",
        source_id: "source-1",
        notebook_id: "notebook-1",
        source_title: "Transformer Paper",
        source_type: "pdf",
        chunk_index: 0,
        content: "Transformers changed sequence modeling.",
        excerpt: "Transformers changed sequence modeling.",
        metadata: { page: 2 },
      }],
    })
  })

  it("shows local desktop content hits for search queries and opens the matched source", async () => {
    render(<KnowledgePage />)

    await waitFor(() => {
      expect(sourceServiceMocks.getAllSources).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByRole("button", { name: "打开知识库搜索" }))
    fireEvent.change(screen.getByPlaceholderText("搜索来源名称或本地内容..."), {
      target: { value: "transformer" },
    })

    await waitFor(() => {
      expect(desktopServiceMocks.searchLocalKnowledge).toHaveBeenCalledWith("transformer", { limit: 6 })
    })

    expect(screen.getByText("本地内容命中")).toBeInTheDocument()
    expect(screen.getByText("Transformers changed sequence modeling.")).toBeInTheDocument()
    expect(screen.getByText("第2页")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Transformers changed sequence modeling."))

    await waitFor(() => {
      expect(sourceServiceMocks.getSourceChunks).toHaveBeenCalledWith("source-1")
    })
  })
})
