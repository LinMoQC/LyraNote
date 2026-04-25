import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAllSources, getSourcesPage } from "@/services/source-service";
import { buildNotebook } from "@test/fixtures/notebook.factory";
import { buildSource } from "@test/fixtures/source.factory";
import type { SourcePage } from "@lyranote/api-client";
vi.mock("@/services/notebook-service", () => ({
  getNotebooks: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({
  getWebSourceService: vi.fn(),
}));

const { getNotebooks } = await import("@/services/notebook-service");
const mockedGetNotebooks = vi.mocked(getNotebooks);
const { getWebSourceService } = await import("@/lib/api-client");
const mockedGetWebSourceService = vi.mocked(getWebSourceService);

const sourceService = {
  getSources: vi.fn(),
  getGlobalSources: vi.fn(),
  getSourcesPage: vi.fn(),
  deleteSource: vi.fn(),
  getChunks: vi.fn(),
  rechunk: vi.fn(),
  updateSource: vi.fn(),
  importUrl: vi.fn(),
  importGlobalUrl: vi.fn(),
  getSuggestions: vi.fn(),
};

describe("source-service contracts", () => {
  beforeEach(() => {
    mockedGetNotebooks.mockReset();
    Object.values(sourceService).forEach((mockFn) => mockFn.mockReset());
    mockedGetWebSourceService.mockReturnValue(sourceService);
  });

  it("maps paginated source responses to frontend contracts", async () => {
    sourceService.getSourcesPage.mockResolvedValue({
      items: [
        buildSource({
          id: "source-1",
          type: "doc",
          status: "processing",
        }),
      ],
      total: 8,
      offset: 20,
      limit: 10,
      hasMore: true,
    } satisfies SourcePage);

    await expect(
      getSourcesPage({ offset: 20, limit: 10, type: "web", search: "agent" }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "source-1",
          type: "doc",
          status: "processing",
        }),
      ],
      total: 8,
      offset: 20,
      limit: 10,
      hasMore: true,
    });
    expect(sourceService.getSourcesPage).toHaveBeenCalledWith({
      offset: 20,
      limit: 10,
      type: "web",
      search: "agent",
    });
  });

  it("deduplicates notebook ids before fetching notebook sources", async () => {
    mockedGetNotebooks.mockResolvedValue([
      buildNotebook({ id: "notebook-1" }),
      buildNotebook({ id: "notebook-1", title: "Duplicate notebook" }),
      buildNotebook({ id: "notebook-2", title: "Systems" }),
    ]);

    sourceService.getGlobalSources.mockResolvedValue([
      buildSource({ id: "global-1", notebookId: "global" }),
    ]);
    sourceService.getSources
      .mockResolvedValueOnce([buildSource({ id: "source-1", notebookId: "notebook-1" })])
      .mockResolvedValueOnce([buildSource({ id: "source-2", notebookId: "notebook-2" })]);

    await expect(getAllSources()).resolves.toEqual([
      expect.objectContaining({ id: "global-1" }),
      expect.objectContaining({ id: "source-1" }),
      expect.objectContaining({ id: "source-2" }),
    ]);

    expect(sourceService.getGlobalSources).toHaveBeenCalledTimes(1);
    expect(sourceService.getSources).toHaveBeenCalledTimes(2);
    expect(sourceService.getSources).toHaveBeenNthCalledWith(1, "notebook-1");
    expect(sourceService.getSources).toHaveBeenNthCalledWith(2, "notebook-2");
  });
});
