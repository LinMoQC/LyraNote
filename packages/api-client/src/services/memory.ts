import type { HttpClient } from "../lib/client";
import { MEMORY } from "../lib/routes";

export interface MemoryDocOut {
  content_md: string;
  updated_at: string | null;
}

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  confidence: number;
  memory_type: "preference" | "fact" | "skill";
  memory_kind: "profile" | "preference" | "project_state" | "reference";
  access_count: number;
  last_accessed_at: string | null;
  expires_at: string | null;
}

export interface MemoryGrouped {
  preference: MemoryEntry[];
  fact: MemoryEntry[];
  skill: MemoryEntry[];
}

export interface MemoryBackfillResult {
  ok?: boolean;
  message?: string;
  total?: number;
  created?: number;
  updated?: number;
}

export function createMemoryService(http: HttpClient) {
  return {
    getMemoryDoc: () => http.get<MemoryDocOut>(MEMORY.DOC),
    updateMemoryDoc: (contentMd: string) =>
      http.patch<void>(MEMORY.DOC, { content_md: contentMd }),
    getMemories: () => http.get<MemoryGrouped>(MEMORY.LIST),
    updateMemory: (id: string, value: string) =>
      http.put<MemoryEntry>(MEMORY.update(id), { value }),
    deleteMemory: (id: string) => http.delete<void>(MEMORY.delete(id)),
    backfillMemory: () => http.post<MemoryBackfillResult>(MEMORY.BACKFILL),
  };
}

export type MemoryService = ReturnType<typeof createMemoryService>;
