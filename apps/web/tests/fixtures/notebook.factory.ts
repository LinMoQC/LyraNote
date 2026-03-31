import type { Notebook } from "@/types";

interface NotebookFactoryOverrides extends Partial<Notebook> {}

export function buildNotebook(overrides: NotebookFactoryOverrides = {}): Notebook {
  return {
    id: "notebook-1",
    title: "AI Research",
    description: "",
    updatedAt: "2026-03-29T08:00:00.000Z",
    sourceCount: 0,
    artifactCount: 0,
    wordCount: 0,
    summary: undefined,
    status: "active",
    isNew: false,
    isPublic: false,
    publishedAt: undefined,
    coverEmoji: undefined,
    coverGradient: undefined,
    ...overrides,
  };
}

export function buildRawNotebook(overrides: Record<string, unknown> = {}) {
  return {
    id: "notebook-1",
    title: "AI Research",
    description: "",
    updated_at: "2026-03-29T08:00:00.000Z",
    source_count: 0,
    word_count: 0,
    summary_md: "Notebook summary",
    status: "active",
    is_new: false,
    is_public: false,
    published_at: null,
    cover_emoji: null,
    cover_gradient: null,
    ...overrides,
  };
}
