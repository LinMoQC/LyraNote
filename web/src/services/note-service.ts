/**
 * @file 笔记内容服务
 * @description 提供笔记的读取和保存接口。每个笔记本下有一个主笔记，
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

/**
 * 将后端原始数据映射为前端 NoteRecord 格式
 * @param raw - 后端返回的原始对象
 * @returns NoteRecord
 */
function mapNote(raw: Record<string, unknown>): NoteRecord {
  return {
    id: String(raw.id),
    title: (raw.title as string | null) ?? null,
    contentJson: (raw.content_json as Record<string, unknown> | null) ?? null,
  }
}

/**
 * 获取笔记本的主笔记
 * @param notebookId - 笔记本 ID
 * @returns 笔记记录，不存在时返回 null
 */
export async function getNoteForNotebook(notebookId: string): Promise<NoteRecord | null> {
  try {
    const data = await http.get<Record<string, unknown>[]>(NOTES.list(notebookId))
    const first = data[0]
    return first ? mapNote(first) : null
  } catch {
    return null
  }
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
