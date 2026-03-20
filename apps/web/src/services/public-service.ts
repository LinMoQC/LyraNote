import { http } from "@/lib/http-client";
import { PUBLIC } from "@/lib/api-routes";
import type { PublicNotebook, PublicNotebookDetail, PublicNote } from "@/types";

/**
 * @file 公开笔记本服务
 * @description 提供已发布笔记本的公开访问接口（无需认证），
 *              用于 marketing 页面展示。
 */

type Raw = Record<string, unknown>;

/**
 * 将后端原始数据映射为公开笔记本格式
 * @param raw - 后端返回的原始对象
 * @returns PublicNotebook
 */
function mapPublicNotebook(raw: Raw): PublicNotebook {
  return {
    id: raw.id as string,
    title: raw.title as string,
    description: (raw.description as string) ?? "",
    summary: (raw.summary_md as string) || undefined,
    coverEmoji: (raw.cover_emoji as string) || undefined,
    coverGradient: (raw.cover_gradient as string) || undefined,
    sourceCount: (raw.source_count as number) ?? 0,
    wordCount: (raw.word_count as number) ?? 0,
    publishedAt: (raw.published_at as string) || undefined,
  };
}

/**
 * 将后端原始数据映射为公开笔记格式
 * @param raw - 后端返回的原始对象
 * @returns PublicNote
 */
function mapPublicNote(raw: Raw): PublicNote {
  return {
    id: raw.id as string,
    title: (raw.title as string) ?? null,
    contentJson: (raw.content_json as Record<string, unknown>) ?? null,
    contentText: (raw.content_text as string) ?? null,
    wordCount: (raw.word_count as number) ?? 0,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

/**
 * 获取所有已发布的公开笔记本列表
 * @returns 公开笔记本数组
 */
export async function getPublicNotebooks(): Promise<PublicNotebook[]> {
  const data = await http.get<Raw[]>(PUBLIC.NOTEBOOKS, { skipToast: true });
  return data.map(mapPublicNotebook);
}

/**
 * 获取单个公开笔记本的详情（含笔记内容）
 * @param id - 笔记本 ID
 * @returns 笔记本详情，不存在时返回 undefined
 */
export async function getPublicNotebook(id: string): Promise<PublicNotebookDetail | undefined> {
  try {
    const raw = await http.get<Raw>(PUBLIC.notebook(id), { skipToast: true });
    const base = mapPublicNotebook(raw);
    const rawNotes = (raw.notes as Raw[]) ?? [];
    return { ...base, notes: rawNotes.map(mapPublicNote) };
  } catch {
    return undefined;
  }
}
