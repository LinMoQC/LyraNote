/**
 * @file 知识来源服务
 */
import type { HttpClient } from "../lib/client";
import { SOURCES } from "../lib/routes";
import { mapSource } from "../lib/mappers";
import type { Source, SourceChunk } from "@lyranote/types";

export interface SourcePageParams {
  offset?: number
  limit?: number
  type?: string
  search?: string
}

export interface SourcePage {
  items: Source[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

export type ChunkStrategy = "coarse" | "standard" | "fine" | "custom"
export type SplitterType = "auto" | "semantic" | "recursive"

export interface RechunkOptions {
  strategy?: ChunkStrategy
  chunk_size?: number
  chunk_overlap?: number
  splitter_type?: SplitterType
  separators?: string[]
  min_chunk_size?: number
}

export interface SourceUpdatePayload {
  notebook_id?: string
  title?: string
}

interface SourcePageResponse {
  items: Record<string, unknown>[]
  total: number
  offset: number
  limit: number
  has_more: boolean
}

export function createSourceService(http: HttpClient) {
  return {
    getSources: async (notebookId: string): Promise<Source[]> => {
      const data = await http.get<unknown[]>(SOURCES.list(notebookId));
      return (data as Record<string, unknown>[]).map(mapSource);
    },

    getGlobalSources: async (): Promise<Source[]> => {
      const data = await http.get<unknown[]>(SOURCES.GLOBAL)
      return (data as Record<string, unknown>[]).map(mapSource)
    },

    getSourcesPage: async (params: SourcePageParams): Promise<SourcePage> => {
      const data = await http.get<SourcePageResponse>(SOURCES.ALL, { params: params as Record<string, any> })
      return {
        items: data.items.map(mapSource),
        total: data.total,
        offset: data.offset,
        limit: data.limit,
        hasMore: data.has_more,
      }
    },

    deleteSource: (sourceId: string): Promise<void> =>
      http.delete(SOURCES.detail(sourceId)),

    importUrl: async (notebookId: string, url: string, title?: string): Promise<Source> => {
      const data = await http.post<Record<string, unknown>>(
        SOURCES.importUrl(notebookId),
        { url, title }
      );
      return mapSource(data);
    },

    importGlobalUrl: async (url: string, title?: string): Promise<Source> => {
      const data = await http.post<Record<string, unknown>>(SOURCES.GLOBAL_IMPORT_URL, {
        url,
        title,
      });
      return mapSource(data);
    },

    updateSource: (sourceId: string, payload: SourceUpdatePayload): Promise<void> =>
      http.patch(SOURCES.detail(sourceId), payload),

    rechunk: (sourceId: string, options?: RechunkOptions): Promise<void> =>
      http.post(SOURCES.rechunk(sourceId), options),

    getSuggestions: (sourceId: string): Promise<string[]> =>
      http.get<string[]>(SOURCES.suggestions(sourceId)),

    getChunks: (sourceId: string): Promise<SourceChunk[]> =>
      http.get<SourceChunk[]>(SOURCES.chunks(sourceId)),
  };
}

export type SourceService = ReturnType<typeof createSourceService>;
