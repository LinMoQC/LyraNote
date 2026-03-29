import { beforeEach, describe, expect, it, vi } from "vitest";

import { NOTEBOOKS } from "@/lib/api-routes";
import { createNotebook, getNotebooks } from "@/services/notebook-service";
import { buildRawNotebook } from "@test/fixtures/notebook.factory";
import { http, resetHttpClientMocks } from "@test/mocks/http-client";

vi.mock("@/lib/http-client", () => import("@test/mocks/http-client"));

describe("notebook-service contracts", () => {
  beforeEach(() => {
    resetHttpClientMocks();
  });

  it("maps notebook list responses into frontend notebooks", async () => {
    http.get.mockResolvedValue([
      buildRawNotebook({
        id: "notebook-1",
        source_count: 3,
        summary_md: "Structured summary",
        cover_emoji: "🧠",
      }),
    ]);

    await expect(getNotebooks()).resolves.toEqual([
      expect.objectContaining({
        id: "notebook-1",
        sourceCount: 3,
        summary: "Structured summary",
        coverEmoji: "🧠",
      }),
    ]);

    expect(http.get).toHaveBeenCalledWith(NOTEBOOKS.LIST, { headers: {} });
  });

  it("posts creation payload and maps the created notebook", async () => {
    http.post.mockResolvedValue(
      buildRawNotebook({
        id: "notebook-2",
        title: "New notebook",
        description: "Created from test",
      }),
    );

    await expect(createNotebook("New notebook", "Created from test")).resolves.toEqual(
      expect.objectContaining({
        id: "notebook-2",
        title: "New notebook",
        description: "Created from test",
      }),
    );

    expect(http.post).toHaveBeenCalledWith(NOTEBOOKS.LIST, {
      title: "New notebook",
      description: "Created from test",
    });
  });
});
