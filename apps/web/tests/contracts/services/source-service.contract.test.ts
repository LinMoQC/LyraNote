import { beforeEach, describe, expect, it, vi } from "vitest";

import { SOURCES } from "@/lib/api-routes";
import { getAllSources, getSourcesPage } from "@/services/source-service";
import { buildNotebook } from "@test/fixtures/notebook.factory";
import { buildRawSource } from "@test/fixtures/source.factory";
import { http, resetHttpClientMocks } from "@test/mocks/http-client";

vi.mock("@/lib/http-client", () => import("@test/mocks/http-client"));
vi.mock("@/services/notebook-service", () => ({
  getNotebooks: vi.fn(),
}));

const { getNotebooks } = await import("@/services/notebook-service");
const mockedGetNotebooks = vi.mocked(getNotebooks);

describe("source-service contracts", () => {
  beforeEach(() => {
    resetHttpClientMocks();
    mockedGetNotebooks.mockReset();
  });

  it("maps paginated source responses to frontend contracts", async () => {
    http.get.mockResolvedValue({
      items: [
        buildRawSource({
          id: "source-1",
          type: "md",
          status: "unknown-status",
        }),
      ],
      total: 8,
      offset: 20,
      limit: 10,
      has_more: true,
    });

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

    expect(http.get).toHaveBeenCalledWith(SOURCES.ALL, {
      params: { offset: 20, limit: 10, type: "web", search: "agent" },
    });
  });

  it("deduplicates notebook ids before fetching notebook sources", async () => {
    mockedGetNotebooks.mockResolvedValue([
      buildNotebook({ id: "notebook-1" }),
      buildNotebook({ id: "notebook-1", title: "Duplicate notebook" }),
      buildNotebook({ id: "notebook-2", title: "Systems" }),
    ]);

    http.get
      .mockResolvedValueOnce([buildRawSource({ id: "global-1", notebook_id: "global" })])
      .mockResolvedValueOnce([buildRawSource({ id: "source-1", notebook_id: "notebook-1" })])
      .mockResolvedValueOnce([buildRawSource({ id: "source-2", notebook_id: "notebook-2" })]);

    await expect(getAllSources()).resolves.toEqual([
      expect.objectContaining({ id: "global-1" }),
      expect.objectContaining({ id: "source-1" }),
      expect.objectContaining({ id: "source-2" }),
    ]);

    expect(http.get).toHaveBeenCalledTimes(3);
    expect(http.get).toHaveBeenNthCalledWith(1, SOURCES.GLOBAL);
    expect(http.get).toHaveBeenNthCalledWith(2, SOURCES.list("notebook-1"));
    expect(http.get).toHaveBeenNthCalledWith(3, SOURCES.list("notebook-2"));
  });
});
