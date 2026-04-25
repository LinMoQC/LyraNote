import type { MemoryBackfillResult } from "@lyranote/api-client"

import { getDesktopMemoryService } from "@/lib/api-client"

export function getMemoryList() {
  return getDesktopMemoryService().getMemories()
}

export function getMemoryDoc() {
  return getDesktopMemoryService().getMemoryDoc()
}

export function updateMemory(id: string, value: string) {
  return getDesktopMemoryService().updateMemory(id, value)
}

export function deleteMemory(id: string) {
  return getDesktopMemoryService().deleteMemory(id)
}

export function updateMemoryDoc(content_md: string) {
  return getDesktopMemoryService().updateMemoryDoc(content_md)
}

export function backfillMemory(): Promise<MemoryBackfillResult> {
  return getDesktopMemoryService().backfillMemory()
}
