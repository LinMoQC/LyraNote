/**
 * @file 知识来源服务
 */
import type { HttpClient } from "../lib/client";
import { SOURCES } from "../lib/routes";
import { mapSource } from "../lib/mappers";
import type { Source } from "@lyranote/types";

export function createSourceService(http: HttpClient) {
  return {
    getSources: async (notebookId: string): Promise<Source[]> => {
      const data = await http.get<unknown[]>(SOURCES.list(notebookId));
      return (data as Record<string, unknown>[]).map(mapSource);
    },

    deleteSource: (sourceId: string): Promise<void> =>
      http.delete(SOURCES.detail(sourceId)),

    importUrl: async (notebookId: string, url: string): Promise<Source> => {
      const data = await http.post<Record<string, unknown>>(
        SOURCES.importUrl(notebookId),
        { url }
      );
      return mapSource(data);
    },

    importGlobalUrl: async (url: string): Promise<Source> => {
      const data = await http.post<Record<string, unknown>>(SOURCES.GLOBAL_IMPORT_URL, { url });
      return mapSource(data);
    },

    rechunk: (sourceId: string): Promise<void> =>
      http.post(SOURCES.rechunk(sourceId)),

    getSuggestions: (sourceId: string): Promise<string[]> =>
      http.get<string[]>(SOURCES.suggestions(sourceId)),

    getChunks: (sourceId: string): Promise<unknown[]> =>
      http.get<unknown[]>(SOURCES.chunks(sourceId)),
  };
}

export type SourceService = ReturnType<typeof createSourceService>;
