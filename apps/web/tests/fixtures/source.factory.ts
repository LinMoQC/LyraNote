import type { Source } from "@/types";

interface SourceFactoryOverrides extends Partial<Source> {}

export function buildSource(overrides: SourceFactoryOverrides = {}): Source {
  return {
    id: "source-1",
    notebookId: "notebook-1",
    title: "Agent paper",
    type: "web",
    summary: "summary",
    status: "indexed",
    metadata: undefined,
    ...overrides,
  };
}

export function buildRawSource(overrides: Record<string, unknown> = {}) {
  return {
    id: "source-1",
    notebook_id: "notebook-1",
    title: "Agent paper",
    type: "web",
    summary: "summary",
    status: "indexed",
    metadata_: undefined,
    ...overrides,
  };
}
