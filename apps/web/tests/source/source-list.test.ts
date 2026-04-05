import { describe, expect, it } from "vitest";

import { dedupeSourcesByLatest } from "@/features/source/source-list";
import type { Source } from "@/types";

function makeSource(overrides: Partial<Source>): Source {
  return {
    id: overrides.id ?? "source-id",
    notebookId: overrides.notebookId ?? "notebook-1",
    title: overrides.title ?? "示例.md",
    type: overrides.type ?? "doc",
    summary: overrides.summary ?? "",
    status: overrides.status ?? "pending",
    updatedAt: overrides.updatedAt,
    metadata: overrides.metadata,
  };
}

describe("dedupeSourcesByLatest", () => {
  it("keeps the most recently updated record for the same notebook/title pair", () => {
    const sources = [
      makeSource({
        id: "old-failed",
        title: "破晓之境.md",
        status: "failed",
        updatedAt: "2026-04-03T15:02:29.287Z",
      }),
      makeSource({
        id: "new-indexed",
        title: "破晓之境.md",
        status: "indexed",
        updatedAt: "2026-04-03T17:40:11.486Z",
      }),
    ];

    expect(dedupeSourcesByLatest(sources)).toEqual([sources[1]]);
  });

  it("does not collapse sources from different notebooks", () => {
    const sources = [
      makeSource({ id: "a", notebookId: "notebook-1", title: "同名资料.md", updatedAt: "2026-04-03T10:00:00Z" }),
      makeSource({ id: "b", notebookId: "notebook-2", title: "同名资料.md", updatedAt: "2026-04-03T11:00:00Z" }),
    ];

    expect(dedupeSourcesByLatest(sources)).toHaveLength(2);
  });

  it("keeps only one record when the same source id appears multiple times", () => {
    const duplicated = makeSource({
      id: "duplicate-id",
      title: "重复来源.md",
      status: "indexed",
      updatedAt: "2026-04-05T09:15:00Z",
    });

    const sources = [duplicated, duplicated];

    expect(dedupeSourcesByLatest(sources)).toEqual([duplicated]);
  });
});
