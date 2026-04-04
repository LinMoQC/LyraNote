import type { Source } from "@/types";

function toTimestamp(value?: string): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function makeSourceKey(source: Source): string {
  return `${source.notebookId}:${source.title.trim().toLowerCase()}`;
}

/**
 * Collapse duplicate source records created by retries/import reruns.
 * Prefer the most recently updated record for the same notebook/title pair.
 */
export function dedupeSourcesByLatest(sources: Source[]): Source[] {
  const winners = new Map<string, Source>();

  for (const source of sources) {
    const key = makeSourceKey(source);
    const current = winners.get(key);
    if (!current) {
      winners.set(key, source);
      continue;
    }

    if (toTimestamp(source.updatedAt) >= toTimestamp(current.updatedAt)) {
      winners.set(key, source);
    }
  }

  return sources.filter((source) => winners.get(makeSourceKey(source))?.id === source.id);
}
