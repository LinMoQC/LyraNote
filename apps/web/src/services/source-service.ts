/**
 * @file 知识来源管理服务
 * @description 提供知识来源（PDF、网页、音频、文档等）的导入、删除、分块查看、
 *              重新分块等操作接口，以及分页查询和全局来源管理。
 */
import { http } from "@/lib/http-client";
import { SOURCES } from "@/lib/api-routes";
import { mapSource } from "@/lib/api-mappers";
import type { Source } from "@/types";

/**
 * 获取指定笔记本下的所有知识来源
 * @param notebookId - 笔记本 ID
 * @returns 来源数组
 */
export async function getSources(notebookId: string): Promise<Source[]> {
  const data = await http.get<Record<string, unknown>[]>(SOURCES.list(notebookId));
  return data.map(mapSource);
}

/**
 * 获取全局（未关联特定笔记本的）知识来源
 * @returns 来源数组
 */
export async function getGlobalSources(): Promise<Source[]> {
  const data = await http.get<Record<string, unknown>[]>(SOURCES.GLOBAL)
  return data.map(mapSource)
}

/**
 * 获取所有知识来源（全局 + 各笔记本），按 ID 去重
 * @returns 去重后的完整来源数组
 */
export async function getAllSources(): Promise<Source[]> {
  const { getNotebooks } = await import("@/services/notebook-service");
  const [notebooks, globalSources] = await Promise.all([
    getNotebooks(),
    getGlobalSources(),
  ]);
  // Deduplicate by id to guard against any future overlap
  const unique = [...new Map(notebooks.map((n) => [n.id, n])).values()];
  const notebookSources = await Promise.all(unique.map((n) => getSources(n.id)));
  return [...globalSources, ...notebookSources.flat()];
}

/** 分页查询结果 */
export interface SourcePage {
  items: Source[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

/**
 * 分页查询知识来源（支持类型过滤和搜索）
 * @param params - 分页参数、类型过滤和搜索关键词
 * @returns 分页结果
 */
export async function getSourcesPage(params: {
  offset?: number
  limit?: number
  type?: string
  search?: string
}): Promise<SourcePage> {
  const data = await http.get<{
    items: Record<string, unknown>[]
    total: number
    offset: number
    limit: number
    has_more: boolean
  }>(SOURCES.ALL, { params })
  return {
    items: data.items.map(mapSource),
    total: data.total,
    offset: data.offset,
    limit: data.limit,
    hasMore: data.has_more,
  }
}

/**
 * 向指定笔记本导入知识来源（URL 或文件上传）
 * @param notebookId - 目标笔记本 ID
 * @param payload - 导入参数（url 或 file）
 * @returns 操作结果
 */
export async function importSource(
  notebookId: string,
  payload: { type: "url"; url: string; title?: string } | { type: "file"; file: File }
): Promise<{ ok: boolean }> {
  if (payload.type === "url") {
    await http.post(SOURCES.importUrl(notebookId), {
      url: payload.url,
      title: payload.title,
    });
  } else {
    const form = new FormData();
    form.append("file", payload.file);
    await http.post(SOURCES.upload(notebookId), form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
  return { ok: true };
}

/**
 * 导入全局知识来源（不关联特定笔记本）
 * @param payload - 导入参数（url 或 file）
 * @returns 操作结果
 */
export async function importGlobalSource(
  payload: { type: "url"; url: string; title?: string } | { type: "file"; file: File }
): Promise<{ ok: boolean }> {
  if (payload.type === "url") {
    await http.post(SOURCES.GLOBAL_IMPORT_URL, {
      url: payload.url,
      title: payload.title,
    })
  } else {
    const form = new FormData()
    form.append("file", payload.file)
    await http.post(SOURCES.GLOBAL_UPLOAD, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  }
  return { ok: true }
}

/**
 * 删除指定知识来源及其向量数据
 * @param sourceId - 来源 ID
 * @returns 操作结果
 */
export async function deleteSource(sourceId: string): Promise<{ ok: boolean }> {
  await http.delete(SOURCES.detail(sourceId));
  return { ok: true };
}

/** 文本分块结构 */
export interface Chunk {
  id: string
  chunk_index: number
  content: string
  token_count: number | null
}

/**
 * 获取知识来源的所有文本分块
 * @param sourceId - 来源 ID
 * @returns 分块数组
 */
export async function getChunks(sourceId: string): Promise<Chunk[]> {
  return http.get<Chunk[]>(SOURCES.chunks(sourceId))
}

/** 分块粒度策略 */
export type ChunkStrategy = "coarse" | "standard" | "fine"

/**
 * 对知识来源重新分块
 * @param sourceId - 来源 ID
 * @param strategy - 分块策略（粗/标准/细）
 */
export async function rechunkSource(
  sourceId: string,
  strategy: ChunkStrategy,
): Promise<void> {
  await http.post(SOURCES.rechunk(sourceId), { strategy })
}

/**
 * 更新知识来源信息
 * @param sourceId - 来源 ID
 * @param payload - 需要更新的字段（笔记本归属、标题等）
 */
export async function updateSource(
  sourceId: string,
  payload: { notebook_id?: string; title?: string },
): Promise<void> {
  await http.patch(SOURCES.detail(sourceId), payload)
}