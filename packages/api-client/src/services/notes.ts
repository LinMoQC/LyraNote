/**
 * @file 笔记 CRUD 服务
 */
import type { HttpClient } from "../lib/client";
import { NOTES } from "../lib/routes";
import { mapNote } from "../lib/mappers";
import type { Note } from "@lyranote/types";

export interface NoteUpdatePayload {
  title?: string | null;
  content_json?: Record<string, unknown> | null;
  content_text?: string | null;
}

export function createNoteService(http: HttpClient) {
  return {
    getNotes: async (notebookId: string): Promise<Note[]> => {
      const data = await http.get<unknown[]>(NOTES.list(notebookId));
      return (data as Record<string, unknown>[]).map(mapNote);
    },

    createNote: async (notebookId: string, title?: string): Promise<Note> => {
      const data = await http.post<Record<string, unknown>>(NOTES.list(notebookId), { title });
      return mapNote(data);
    },

    updateNote: async (noteId: string, payload: NoteUpdatePayload): Promise<Note> => {
      const data = await http.patch<Record<string, unknown>>(NOTES.detail(noteId), payload);
      return mapNote(data);
    },
  };
}

export type NoteService = ReturnType<typeof createNoteService>;
