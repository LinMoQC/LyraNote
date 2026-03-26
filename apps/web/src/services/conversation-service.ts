/**
 * @file 对话管理服务
 * @description 提供对话列表查询、创建对话、消息读取/保存、删除对话等接口。
 *              数据通过 Zod Schema 进行运行时校验。
 */
import { http } from "@/lib/http-client"
import { CONVERSATIONS } from "@/lib/api-routes"
import type { ChatRole } from "@/lib/constants"
import {
  ConversationListSchema,
  ConversationRecordSchema,
  MessageListSchema,
  MessageRecordSchema,
  type ConversationRecordDto,
  type MessageRecordDto,
} from "@/schemas/chat-api";

/** 对话记录类型（从 Zod Schema 推导） */
export type ConversationRecord = ConversationRecordDto
/** 消息记录类型（从 Zod Schema 推导） */
export type MessageRecord = MessageRecordDto

interface ListParams {
  offset?: number
  limit?: number
}

/**
 * 获取指定笔记本下的对话列表
 * @param notebookId - 笔记本 ID
 * @param params - 分页参数（offset, limit）
 * @returns 对话记录数组
 */
export async function getConversations(
  notebookId: string,
  params: ListParams = {},
): Promise<ConversationRecord[]> {
  const queryParams: Record<string, string | number> = {}
  if (params.offset != null) queryParams.offset = params.offset
  if (params.limit != null) queryParams.limit = params.limit
  const data = await http.get<ConversationRecord[]>(CONVERSATIONS.list(notebookId), {
    params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
  })
  return ConversationListSchema.parse(data)
}

/**
 * 获取全局对话列表（无笔记本绑定，用于 Chat 页面）
 * @param params - 分页参数（offset, limit）
 * @returns 对话记录数组
 */
export async function getGlobalConversations(
  params: ListParams = {},
): Promise<ConversationRecord[]> {
  const queryParams: Record<string, string | number> = {}
  if (params.offset != null) queryParams.offset = params.offset
  if (params.limit != null) queryParams.limit = params.limit
  const data = await http.get<ConversationRecord[]>(CONVERSATIONS.GLOBAL_LIST, {
    params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
  })
  return ConversationListSchema.parse(data)
}

/**
 * 在指定笔记本下创建新对话
 * @param notebookId - 笔记本 ID
 * @param title - 可选的对话标题
 * @returns 新创建的对话记录
 */
export async function createConversation(
  notebookId: string,
  title?: string,
): Promise<ConversationRecord> {
  const data = await http.post<ConversationRecord>(CONVERSATIONS.list(notebookId), {
    title: title ?? null,
  })
  return ConversationRecordSchema.parse(data)
}

/**
 * 创建全局对话（无笔记本绑定，用于 Chat 页面）
 * @param title - 可选的对话标题
 * @returns 新创建的对话记录
 */
export async function createGlobalConversation(
  title?: string,
): Promise<ConversationRecord> {
  const data = await http.post<ConversationRecord>(CONVERSATIONS.GLOBAL_LIST, {
    title: title ?? null,
  })
  return ConversationRecordSchema.parse(data)
}

/**
 * 获取指定对话的消息列表
 * @param conversationId - 对话 ID
 * @param params - 分页参数
 * @returns 消息记录数组
 */
export async function getMessages(
  conversationId: string,
  params: ListParams = {},
): Promise<MessageRecord[]> {
  const queryParams: Record<string, string | number> = {}
  if (params.offset != null) queryParams.offset = params.offset
  if (params.limit != null) queryParams.limit = params.limit
  const data = await http.get<MessageRecord[]>(CONVERSATIONS.messages(conversationId), {
    params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
  })
  return MessageListSchema.parse(data)
}

/**
 * 向对话中保存一条消息
 * @param conversationId - 对话 ID
 * @param role - 消息角色（"user" | "assistant"）
 * @param content - 消息文本内容
 * @param citations - 可选的引用数据
 * @returns 保存后的消息记录
 */
export async function saveMessage(
  conversationId: string,
  role: ChatRole,
  content: string,
  citations?: unknown[] | null,
): Promise<MessageRecord> {
  const data = await http.post<MessageRecord>(CONVERSATIONS.saveMessage(conversationId), {
    role,
    content,
    citations: citations ?? null,
  })
  return MessageRecordSchema.parse(data)
}

/**
 * 删除指定对话及其所有消息
 * @param conversationId - 对话 ID
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  await http.delete(CONVERSATIONS.detail(conversationId))
}
