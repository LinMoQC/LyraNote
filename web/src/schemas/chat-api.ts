/**
 * @file 对话 API 数据校验 Schema
 * @description 使用 Zod 对后端对话相关接口的响应数据进行运行时类型校验，
 *              确保数据结构符合预期，防止脏数据进入前端状态。
 */

import { z } from "zod";
import { CHAT_ROLES } from "@/lib/constants";

/** 对话记录 Schema */
export const ConversationRecordSchema = z.object({
  id: z.string().uuid(),
  notebook_id: z.string().uuid(),
  title: z.string().nullable(),
  created_at: z.string(),
});

/** 消息记录 Schema（含引用、Agent 步骤和附件） */
export const MessageRecordSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: z.enum(CHAT_ROLES),
  content: z.string(),
  citations: z.array(z.unknown()).nullable(),
  agent_steps: z.array(z.unknown()).nullable(),
  attachments: z.array(z.object({
    name: z.string(),
    type: z.string(),
    file_id: z.string(),
  })).nullable().optional(),
  created_at: z.string(),
});

/** 对话列表 Schema */
export const ConversationListSchema = z.array(ConversationRecordSchema);
/** 消息列表 Schema */
export const MessageListSchema = z.array(MessageRecordSchema);

/** 创建对话响应 Schema（只需 id） */
export const CreateConversationResponseSchema = z.object({
  id: z.string().uuid(),
});

/** 对话记录 DTO 类型（从 Schema 推导） */
export type ConversationRecordDto = z.infer<typeof ConversationRecordSchema>;
/** 消息记录 DTO 类型（从 Schema 推导） */
export type MessageRecordDto = z.infer<typeof MessageRecordSchema>;
