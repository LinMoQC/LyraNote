/**
 * @file 笔记本 CRUD 服务
 */
import type { HttpClient } from "../lib/client";
import { NOTEBOOKS } from "../lib/routes";
import { mapNotebook } from "../lib/mappers";
import type { Notebook } from "@lyranote/types";

export interface NotebookUpdatePayload {
  title?: string;
  cover_emoji?: string;
  description?: string;
}

export function createNotebookService(http: HttpClient) {
  return {
    getNotebooks: async (): Promise<Notebook[]> => {
      const data = await http.get<unknown[]>(NOTEBOOKS.LIST);
      return (data as Record<string, unknown>[]).map(mapNotebook);
    },

    getNotebook: async (id: string): Promise<Notebook | undefined> => {
      try {
        const data = await http.get<Record<string, unknown>>(NOTEBOOKS.detail(id));
        return mapNotebook(data);
      } catch {
        return undefined;
      }
    },

    getGlobalNotebook: async (): Promise<Notebook> => {
      const data = await http.get<Record<string, unknown>>(NOTEBOOKS.GLOBAL);
      return mapNotebook(data);
    },

    createNotebook: async (title: string, description?: string): Promise<Notebook> => {
      const data = await http.post<Record<string, unknown>>(NOTEBOOKS.LIST, {
        title,
        description,
      });
      return mapNotebook(data);
    },

    updateNotebook: async (id: string, payload: NotebookUpdatePayload): Promise<Notebook> => {
      const data = await http.patch<Record<string, unknown>>(NOTEBOOKS.detail(id), payload);
      return mapNotebook(data);
    },

    deleteNotebook: (id: string): Promise<void> =>
      http.delete(NOTEBOOKS.detail(id)),

    publishNotebook: async (id: string): Promise<Notebook> => {
      const data = await http.patch<Record<string, unknown>>(NOTEBOOKS.publish(id));
      return mapNotebook(data);
    },

    unpublishNotebook: async (id: string): Promise<Notebook> => {
      const data = await http.patch<Record<string, unknown>>(NOTEBOOKS.unpublish(id));
      return mapNotebook(data);
    },
  };
}

export type NotebookService = ReturnType<typeof createNotebookService>;
