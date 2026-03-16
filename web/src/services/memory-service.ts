import { http } from "@/lib/http-client"
import { MEMORY } from "@/lib/api-routes"

/**
 * @file AI 记忆文档服务
 * @description 提供 AI 长期记忆文档（Markdown 格式）的读取和更新接口。
 *              记忆文档用于存储用户偏好、常用术语等 AI 需要持久记住的信息。
 */

/** 记忆文档输出结构 */
export interface MemoryDocOut {
  content_md: string
  updated_at: string | null
}

/**
 * 获取当前 AI 记忆文档内容
 * @returns 记忆文档（Markdown 内容和最后更新时间）
 */
export async function getMemoryDoc(): Promise<MemoryDocOut> {
  return http.get<MemoryDocOut>(MEMORY.DOC)
}

/**
 * 更新 AI 记忆文档
 * @param content_md - 新的 Markdown 内容
 */
export async function updateMemoryDoc(content_md: string): Promise<void> {
  await http.patch(MEMORY.DOC, { content_md })
}
