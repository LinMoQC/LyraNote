import { http } from "@/lib/http-client"
import { MEMORY } from "@/lib/api-routes"

/**
 * @file AI 记忆服务
 * @description 提供 AI 长期记忆文档 + 结构化记忆条目的完整 CRUD 接口。
 */

// ── Memory document (Markdown) ───────────────────────────────────────────────

export interface MemoryDocOut {
  content_md: string
  updated_at: string | null
}

export async function getMemoryDoc(): Promise<MemoryDocOut> {
  return http.get<MemoryDocOut>(MEMORY.DOC)
}

export async function updateMemoryDoc(content_md: string): Promise<void> {
  await http.patch(MEMORY.DOC, { content_md })
}

// ── Structured memory entries ────────────────────────────────────────────────

export interface MemoryEntry {
  id: string
  key: string
  value: string
  confidence: number
  memory_type: "preference" | "fact" | "skill"
  access_count: number
  last_accessed_at: string | null
  expires_at: string | null
}

export interface MemoryGrouped {
  preference: MemoryEntry[]
  fact: MemoryEntry[]
  skill: MemoryEntry[]
}

export async function getMemories(): Promise<MemoryGrouped> {
  return http.get<MemoryGrouped>(MEMORY.LIST)
}

export async function updateMemory(id: string, value: string): Promise<MemoryEntry> {
  return http.put<MemoryEntry>(MEMORY.update(id), { value })
}

export async function deleteMemory(id: string): Promise<void> {
  await http.delete(MEMORY.delete(id))
}
