/**
 * @file 对话视图工具函数
 * @description 提供对话消息的时间格式化、日期分组、服务端记录映射、
 *              消息排序、引用解析等辅助功能。被 ChatView 及相关组件共享使用。
 */
import { type ReactNode } from "react";
import { UPLOADS } from "@/lib/api-routes";
import { http } from "@/lib/http-client";
export { renderInlineCitations, processChildren } from "@/lib/citation-utils";
import type { ConversationRecord, MessageRecord } from "@/services/conversation-service";
import type { CitationData } from "@/types";
import type { LocalMessage } from "./chat-types";

/**
 * 将消息时间格式化为人类可读的相对时间
 * @param date - 消息时间戳
 * @param t - 国际化翻译函数
 * @param locale - 日期格式化的语言环境，默认 "zh-CN"
 * @returns "14:30" | "昨天" | "3天前" | "3月15日" 等格式
 */
export function formatTime(
  date: Date,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
  locale = "zh-CN",
) {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return t("yesterday");
  if (days < 7) return t("daysAgo", { days });
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/**
 * 将对话列表按日期分组为「今天/昨天/更早」三组
 * @param convs - 对话记录数组
 * @returns {{ today, yesterday, older }} 分组后的对话数组
 */
export function groupByDate(convs: ConversationRecord[]) {
  const today: ConversationRecord[] = [];
  const yesterday: ConversationRecord[] = [];
  const older: ConversationRecord[] = [];
  const now = new Date();
  convs.forEach((c) => {
    const diff = now.getTime() - new Date(c.created_at).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) today.push(c);
    else if (days === 1) yesterday.push(c);
    else older.push(c);
  });
  return { today, yesterday, older };
}

/**
 * 将服务端消息记录转换为前端本地消息格式
 * @param m - 服务端返回的消息记录（snake_case 字段）
 * @returns 转换后的 LocalMessage 对象
 */
export function mapRecord(m: MessageRecord): LocalMessage {
  const base: LocalMessage = {
    id: m.id,
    role: m.role,
    content: m.content,
    reasoning: m.reasoning ?? undefined,
    timestamp: new Date(m.created_at),
    citations: (m.citations as CitationData[] | null) ?? undefined,
    agentSteps: (m.agent_steps as unknown[] | null) as LocalMessage["agentSteps"],
    speed: m.speed ?? undefined,
  };
  if (m.attachments && m.attachments.length > 0) {
    base.attachments = m.attachments.map((a) => ({
      name: a.name,
      type: a.type,
      previewUrl: a.type.startsWith("image/") ? http.url(UPLOADS.tempPreview(a.file_id)) : null,
    }));
  }
  return base;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * 判断消息 ID 是否为服务端生成的 UUID 格式
 * @param id - 消息 ID
 * @returns 是否为合法的 UUID
 */
export function isServerMessageId(id: string) {
  return UUID_RE.test(id);
}

/**
 * 判断消息是否为本地未持久化的 AI 草稿（流式传输中的临时消息）
 * @param message - 消息对象（至少包含 id 和 role）
 * @returns 是否为本地草稿
 */
export function isLocalAssistantDraft(message: Pick<LocalMessage, "id" | "role">) {
  return (
    message.role === "assistant" &&
    (message.id.startsWith("local-asst-") || message.id.startsWith("local-dr-"))
  );
}

/**
 * 按时间戳升序排列消息，同一时刻的消息按 user 在前排列
 * @param messages - 消息数组
 * @returns 排序后的新数组（不修改原数组）
 */
export function sortMessagesByTime(messages: LocalMessage[]) {
  return [...messages].sort((a, b) => {
    const diff = a.timestamp.getTime() - b.timestamp.getTime();
    if (diff !== 0) return diff;
    if (a.role !== b.role) return a.role === "user" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * 浅比较两个对话列表的 ID 序列是否一致（用于避免不必要的状态更新）
 * @param a - 对话列表 A
 * @param b - 对话列表 B
 * @returns ID 序列是否完全相同
 */
export function sameConversationIds(a: ConversationRecord[], b: ConversationRecord[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
}

// ── Inline citation parsing (shared) ──────────────────────────────────────────
// renderInlineCitations and processChildren are re-exported from @/lib/citation-utils above.

/**
 * 将 Markdown 加粗语法 **text** 解析为 <strong> 元素
 * @param text - 包含 **加粗** 标记的文本
 * @returns 混合文本和 <strong> 节点的 ReactNode
 */
export function parseBold(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  const re = /\*\*(.+?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    parts.push(<strong key={m.index} className="font-semibold text-foreground">{m[1]}</strong>);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 1 ? parts : parts[0] ?? text;
}
