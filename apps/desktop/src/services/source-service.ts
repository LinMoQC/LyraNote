import { mapSource } from "@/lib/mappers"
import { getDesktopHttpClient, getDesktopSourceService } from "@/lib/api-client"
import type { Source } from "@/types"

interface PaginatedSourceResponse {
  items?: Record<string, unknown>[]
  total?: number
  has_more?: boolean
}

export interface SourcePage {
  items: Source[]
  total: number
  hasMore: boolean
}

export async function getAllSources(offset = 0, limit = 100): Promise<SourcePage> {
  const data = await getDesktopHttpClient().get<PaginatedSourceResponse>("/sources/all", {
    params: { offset, limit },
  })

  return {
    items: (data.items ?? []).map(mapSource),
    total: data.total ?? 0,
    hasMore: data.has_more ?? false,
  }
}

export async function getSourceChunks(sourceId: string) {
  return getDesktopSourceService().getChunks(sourceId)
}

export async function importGlobalUrl(url: string) {
  const data = await getDesktopHttpClient().post<Record<string, unknown>>(
    "/sources/global/import-url",
    { url },
  )
  return mapSource(data)
}

export async function importGlobalPath(path: string, sha256?: string | null) {
  const data = await getDesktopHttpClient().post<Record<string, unknown>>(
    "/sources/global/import-path",
    { path, sha256: sha256 ?? null },
  )
  return mapSource(data)
}

export async function uploadGlobalSource(file: File) {
  const form = new FormData()
  form.append("file", file)
  const data = await getDesktopHttpClient().fetchJson<Record<string, unknown>>(
    "/sources/global/upload",
    {
      method: "POST",
      body: form,
    },
  )
  return mapSource(data)
}

export function deleteSource(sourceId: string) {
  return getDesktopSourceService().deleteSource(sourceId)
}

export function rechunkSource(sourceId: string) {
  return getDesktopSourceService().rechunk(sourceId)
}
