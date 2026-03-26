/**
 * @file 笔记内容服务
 * @description 提供笔记的读取和保存接口，支持每个笔记本下多篇笔记。
 *              内容以 Tiptap JSON 格式存储。
 */
import { http } from "@/lib/http-client"
import { NOTES } from "@/lib/api-routes"

/** 笔记记录结构 */
export interface NoteRecord {
  id: string
  title: string | null
  contentJson: Record<string, unknown> | null
}

function mapNote(raw: Record<string, unknown>): NoteRecord {
  return {
    id: String(raw.id),
    title: (raw.title as string | null) ?? null,
    contentJson: (raw.content_json as Record<string, unknown> | null) ?? null,
  }
}

/** 获取笔记本下所有笔记（按 updated_at 倒序） */
export async function listNotes(notebookId: string): Promise<NoteRecord[]> {
  try {
    const data = await http.get<Record<string, unknown>[]>(NOTES.list(notebookId))
    return data.map(mapNote)
  } catch {
    return []
  }
}

/** 获取单篇笔记 */
export async function getNote(noteId: string): Promise<NoteRecord | null> {
  try {
    const data = await http.get<Record<string, unknown>>(NOTES.detail(noteId))
    return mapNote(data)
  } catch {
    return null
  }
}

/** 删除笔记 */
export async function deleteNote(noteId: string): Promise<void> {
  await http.delete(NOTES.detail(noteId))
}

/** 创建新笔记（空内容） */
export async function createNote(notebookId: string, title: string): Promise<NoteRecord> {
  const data = await http.post<Record<string, unknown>>(NOTES.list(notebookId), {
    title,
    content_json: { type: "doc", content: [{ type: "paragraph" }] },
    content_text: "",
  })
  return mapNote(data)
}

/**
 * 获取笔记本的第一篇笔记（向后兼容旧逻辑）
 * @param notebookId - 笔记本 ID
 * @returns 笔记记录，不存在时返回 null
 */
export async function getNoteForNotebook(notebookId: string): Promise<NoteRecord | null> {
  const notes = await listNotes(notebookId)
  return notes[0] ?? null
}

/**
 * 保存笔记内容（自动判断创建或更新）
 * @param params.notebookId - 所属笔记本 ID
 * @param params.noteId - 笔记 ID（null 则创建新笔记）
 * @param params.title - 笔记标题
 * @param params.contentJson - Tiptap 编辑器 JSON 内容
 * @returns 保存后的笔记记录
 */
export async function saveNote({
  notebookId,
  noteId,
  title,
  contentJson,
}: {
  notebookId: string
  noteId: string | null
  title: string
  contentJson: Record<string, unknown>
}): Promise<NoteRecord> {
  if (noteId) {
    const data = await http.patch<Record<string, unknown>>(NOTES.detail(noteId), {
      title,
      content_json: contentJson,
      content_text: "",
    })
    return mapNote(data)
  }
  const data = await http.post<Record<string, unknown>>(NOTES.list(notebookId), {
    title,
    content_json: contentJson,
    content_text: "",
  })
  return mapNote(data)
}
