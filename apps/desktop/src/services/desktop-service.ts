import { getDesktopHttpClient } from "@/lib/api-client"
import type {
  DesktopJob,
  DesktopLocalFileInspection,
  DesktopLocalSearchResult,
  DesktopRecentImport,
  DesktopWatchFolder,
} from "@/types"

interface DesktopListResponse<T> {
  items?: T[]
}

export async function getDesktopJobs(): Promise<DesktopJob[]> {
  const data = await getDesktopHttpClient().get<DesktopListResponse<DesktopJob>>("/jobs")
  return data.items ?? []
}

export async function cancelDesktopJob(jobId: string) {
  return getDesktopHttpClient().post<{ cancelled: boolean; reason?: string | null }>(
    `/jobs/${jobId}/cancel`,
  )
}

export async function getWatchFolders(): Promise<DesktopWatchFolder[]> {
  const data = await getDesktopHttpClient().get<DesktopListResponse<DesktopWatchFolder>>(
    "/watch-folders",
  )
  return data.items ?? []
}

export async function createWatchFolder(path: string): Promise<DesktopWatchFolder> {
  return getDesktopHttpClient().post<DesktopWatchFolder>("/watch-folders", { path })
}

export async function deleteWatchFolder(id: string): Promise<void> {
  await getDesktopHttpClient().fetchJson("/watch-folders", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  })
}

export async function getRecentImports(): Promise<DesktopRecentImport[]> {
  const data = await getDesktopHttpClient().get<DesktopListResponse<DesktopRecentImport>>(
    "/recent-imports",
  )
  return data.items ?? []
}

export async function inspectLocalFile(
  path: string,
  sha256?: string | null,
): Promise<DesktopLocalFileInspection> {
  return getDesktopHttpClient().post<DesktopLocalFileInspection>("/local-files/inspect", {
    path,
    sha256: sha256 ?? null,
  })
}

export async function searchLocalKnowledge(
  query: string,
  options: {
    notebookId?: string | null
    sourceId?: string | null
    limit?: number
  } = {},
): Promise<DesktopLocalSearchResult> {
  return getDesktopHttpClient().get<DesktopLocalSearchResult>("/search/local", {
    params: {
      query,
      ...(options.notebookId ? { notebook_id: options.notebookId } : {}),
      ...(options.sourceId ? { source_id: options.sourceId } : {}),
      limit: options.limit ?? 6,
    },
  })
}
