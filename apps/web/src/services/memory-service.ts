import type {
  MemoryDocOut,
  MemoryEntry,
  MemoryGrouped,
} from "@lyranote/api-client"

import { getWebMemoryService } from "@/lib/api-client"

export type { MemoryDocOut, MemoryEntry, MemoryGrouped } from "@lyranote/api-client"

/**
 * @file AI 记忆服务
 * @description 提供 AI 长期记忆文档 + 结构化记忆条目的完整 CRUD 接口。
 */

// ── Memory document (Markdown) ───────────────────────────────────────────────

export async function getMemoryDoc(): Promise<MemoryDocOut> {
  return getWebMemoryService().getMemoryDoc()
}

export async function updateMemoryDoc(content_md: string): Promise<void> {
  await getWebMemoryService().updateMemoryDoc(content_md)
}

// ── Structured memory entries ────────────────────────────────────────────────

export async function getMemories(): Promise<MemoryGrouped> {
  return getWebMemoryService().getMemories()
}

export async function updateMemory(id: string, value: string): Promise<MemoryEntry> {
  return getWebMemoryService().updateMemory(id, value)
}

export async function deleteMemory(id: string): Promise<void> {
  await getWebMemoryService().deleteMemory(id)
}
