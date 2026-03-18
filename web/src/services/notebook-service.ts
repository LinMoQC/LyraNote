/**
 * @file 笔记本 CRUD 服务
 * @description 提供笔记本的增删改查、发布/取消发布等操作接口。
 */
import { http } from "@/lib/http-client";
import { mapNotebook } from "@/lib/api-mappers";
import { NOTEBOOKS } from "@/lib/api-routes";
import { getServerAuthHeaders } from "@/lib/server-auth";
import type { Notebook } from "@/types";

/**
 * 获取当前用户的所有笔记本列表
 * @returns 笔记本数组
 */
export async function getNotebooks(): Promise<Notebook[]> {
  // On the server (RSC), forward the auth cookie manually since
  // httpOnly cookies are not accessible by the browser's fetch/axios.
  const headers = typeof window === "undefined" ? await getServerAuthHeaders() : {}
  const data = await http.get<unknown[]>(NOTEBOOKS.LIST, { headers });
  return (data as Record<string, unknown>[]).map(mapNotebook);
}

/**
 * 获取单个笔记本详情
 * @param id - 笔记本 ID
 * @returns 笔记本对象，不存在时返回 undefined
 */
export async function getNotebook(id: string): Promise<Notebook | undefined> {
  try {
    const headers = typeof window === "undefined" ? await getServerAuthHeaders() : {}
    const data = await http.get<Record<string, unknown>>(NOTEBOOKS.detail(id), { headers });
    return mapNotebook(data);
  } catch {
    return undefined;
  }
}

/**
 * 获取全局笔记本（跨笔记本知识检索用）
 * @returns 全局笔记本对象
 */
export async function getGlobalNotebook(): Promise<Notebook> {
  const headers = typeof window === "undefined" ? await getServerAuthHeaders() : {}
  const data = await http.get<Record<string, unknown>>(NOTEBOOKS.GLOBAL, { headers })
  return mapNotebook(data)
}

/**
 * 重命名笔记本
 * @param id - 笔记本 ID
 * @param title - 新标题
 * @returns 更新后的笔记本
 */
export async function renameNotebook(id: string, title: string): Promise<Notebook> {
  const data = await http.patch<Record<string, unknown>>(NOTEBOOKS.detail(id), { title })
  return mapNotebook(data)
}

export interface NotebookUpdatePayload {
  title?: string
  cover_emoji?: string
}

export async function updateNotebook(id: string, payload: NotebookUpdatePayload): Promise<Notebook> {
  const data = await http.patch<Record<string, unknown>>(NOTEBOOKS.detail(id), payload)
  return mapNotebook(data)
}

/**
 * 删除笔记本及其关联数据
 * @param id - 笔记本 ID
 */
export async function deleteNotebook(id: string): Promise<void> {
  await http.delete(NOTEBOOKS.detail(id));
}

/**
 * 创建新笔记本
 * @param title - 笔记本标题
 * @param description - 可选描述
 * @returns 新创建的笔记本
 */
export async function createNotebook(
  title: string,
  description?: string
): Promise<Notebook> {
  const data = await http.post<Record<string, unknown>>(NOTEBOOKS.LIST, { title, description });
  return mapNotebook(data);
}

/**
 * 发布笔记本（设为公开可访问）
 * @param id - 笔记本 ID
 * @returns 更新后的笔记本
 */
export async function publishNotebook(id: string): Promise<Notebook> {
  const data = await http.patch<Record<string, unknown>>(NOTEBOOKS.publish(id));
  return mapNotebook(data);
}

/**
 * 取消发布笔记本（设为私有）
 * @param id - 笔记本 ID
 * @returns 更新后的笔记本
 */
export async function unpublishNotebook(id: string): Promise<Notebook> {
  const data = await http.patch<Record<string, unknown>>(NOTEBOOKS.unpublish(id));
  return mapNotebook(data);
}
