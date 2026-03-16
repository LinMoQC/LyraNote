import { http } from "@/lib/http-client"
import { FEEDBACK } from "@/lib/api-routes"

/**
 * @file 消息反馈服务
 * @description 提供用户对 AI 回复的点赞/点踩反馈提交和查询接口。
 */

/** 反馈评分类型 */
export type FeedbackRating = "like" | "dislike"

/** 消息反馈记录 */
export interface MessageFeedback {
  message_id: string
  rating: FeedbackRating
  comment?: string | null
  created_at: string
  updated_at: string
}

/**
 * 提交消息反馈（点赞或点踩）
 * @param messageId - 消息 ID
 * @param rating - 评分（"like" | "dislike"）
 * @param comment - 可选的文字评论
 * @returns 保存后的反馈记录
 */
export async function submitMessageFeedback(
  messageId: string,
  rating: FeedbackRating,
  comment?: string,
): Promise<MessageFeedback> {
  return http.post<MessageFeedback>(FEEDBACK.submit(messageId), {
    rating,
    comment: comment ?? null,
  })
}

/**
 * 获取指定对话中所有消息的反馈列表
 * @param conversationId - 对话 ID
 * @returns 反馈记录数组
 */
export async function getConversationFeedback(
  conversationId: string,
): Promise<MessageFeedback[]> {
  return http.get<MessageFeedback[]>(FEEDBACK.list(conversationId))
}
