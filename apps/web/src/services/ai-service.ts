/**
 * @file AI 核心服务
 * @description 提供 AI 对话、流式消息、Agent 事件处理、内容生成物（Artifact）、
 *              上下文建议、写作辅助、知识关联、主动洞察和深度研究等接口。
 *              是前端与 AI 后端交互的核心模块。
 */
import { http } from "@/lib/http-client";
import { AI, CONVERSATIONS, INSIGHTS, SOURCES } from "@/lib/api-routes";
import { t } from "@/lib/i18n";
import { mapArtifact } from "@/lib/api-mappers";
import { authHeaderFromCookie, getErrorMessage, isAbortError } from "@/lib/request-error";
import {
  CreateConversationResponseSchema,
  MessageGenerationCreateResponseSchema,
  MessageGenerationStatusSchema,
  type MessageGenerationCreateResponseDto,
  type MessageGenerationStatusDto,
} from "@/schemas/chat-api";
import type { Artifact, CitationData, Message } from "@/types";

// ─── Conversation history (stub — messages are managed client-side) ──────────

/**
 * 获取对话历史记录（当前为空 stub，消息由客户端管理）
 * @returns 空消息数组
 */
export async function getConversation(): Promise<Message[]> {
  return [];
}

// ─── Non-streaming message ───────────────────────────────────────────────────

/**
 * 发送非流式消息（同步等待完整回复）
 * @param prompt - 用户消息内容
 * @returns AI 回复的完整消息
 */
export async function sendMessage(prompt: string): Promise<Message> {
  const data = await http.post<Record<string, unknown>>(AI.CHAT, { prompt });
  return data as Message;
}

// ─── Ghost Text inline suggestion ────────────────────────────────────────────

/**
 * 获取编辑器 Ghost Text 行内补全建议
 * @param context - 光标周围的上下文文本
 * @returns 建议的续写文本
 */
export async function getInlineSuggestion(context: string): Promise<string> {
  const data = await http.post<{ suggestion: string }>(AI.SUGGEST, {
    cursor_text: context,
    note_context: "",
  });
  return data.suggestion;
}

// ─── Streaming chat ───────────────────────────────────────────────────────────

/** 流式 Agent 事件（SSE 推送的各类事件） */
export interface AgentEvent {
  type: "token" | "reasoning" | "citations" | "done" | "thought" | "tool_call" | "tool_result" | "mind_map" | "diagram" | "mcp_result" | "note_created" | "speed" | "human_approve_required" | "error" | "ui_element" | "content_replace"
  event_index?: number
  content?: string
  tool?: string
  input?: Record<string, unknown>
  citations?: CitationData[]
  data?: Record<string, unknown>
  element_type?: string
  note_id?: string
  note_title?: string
  notebook_id?: string
  message_id?: string
  ttft_ms?: number
  tps?: number
  tokens?: number
  tool_names?: string[]
  /** True for system-emitted thoughts (verify, context_compress, synthesis) — mapped to icon+label by frontend */
  is_system?: boolean
  /** Present on human_approve_required — the UUID to pass to the approve endpoint */
  approval_id?: string
  /** Present on human_approve_required — full list of pending MCP tool calls */
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>
}

/** 消息附件元信息 */
export interface AttachmentMeta {
  name: string
  type: string
  file_id: string
}

export interface MessageGenerationHandle {
  generation_id: string
  conversation_id: string
  user_message_id: string
  assistant_message_id: string
}

async function consumeGenerationStream(
  response: Response,
  onToken: (token: string) => void,
  onDone: (citations?: CitationData[]) => void,
  onAgentEvent?: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let richCitations: CitationData[] = [];

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;

      try {
        const event = JSON.parse(json) as AgentEvent;
        if (event.type === "token" && event.content) {
          onToken(event.content);
        } else if (event.type === "reasoning" && event.content && onAgentEvent) {
          onAgentEvent(event);
        } else if (event.type === "citations" && event.citations) {
          richCitations = (event.citations as unknown as Array<Record<string, unknown>>).map((c, i) => ({
            source_id: (c.source_id as string) ?? "",
            chunk_id: (c.chunk_id as string) ?? `chunk-${i}`,
            source_title: (c.source_title as string) ?? t("common.sourceLabel", "Source {index}").replace("{index}", String(i + 1)),
            excerpt: (c.excerpt as string) ?? (c.content as string) ?? "",
            score: c.score as number | undefined,
          }));
          onAgentEvent?.({ type: "citations", citations: richCitations, event_index: event.event_index });
        } else if (
          (
            event.type === "speed"
            || event.type === "human_approve_required"
            || event.type === "thought"
            || event.type === "tool_call"
            || event.type === "tool_result"
            || event.type === "mind_map"
            || event.type === "diagram"
            || event.type === "mcp_result"
            || event.type === "ui_element"
            || event.type === "note_created"
            || event.type === "content_replace"
            || event.type === "done"
          ) &&
          onAgentEvent
        ) {
          onAgentEvent(event);
        } else if (event.type === "error" && event.content) {
          onToken(event.content);
          onAgentEvent?.(event);
        }
      } catch (error) {
        if (isAbortError(error)) throw error;
      }
    }
  }

  onDone(richCitations.length ? richCitations : undefined);
}

export async function startMessageGeneration(
  conversationId: string,
  prompt: string,
  {
    globalSearch,
    toolHint,
    attachmentIds,
    attachmentsMeta,
    thinkingEnabled,
  }: {
    globalSearch?: boolean
    toolHint?: string
    attachmentIds?: string[]
    attachmentsMeta?: AttachmentMeta[]
    thinkingEnabled?: boolean
  } = {},
  signal?: AbortSignal,
): Promise<MessageGenerationCreateResponseDto> {
  const raw = await http.fetchJson<MessageGenerationCreateResponseDto>(
    CONVERSATIONS.startGeneration(conversationId),
    {
      method: "POST",
      body: JSON.stringify({
        content: prompt,
        global_search: globalSearch ?? false,
        ...(toolHint ? { tool_hint: toolHint } : {}),
        ...(attachmentIds?.length ? { attachment_ids: attachmentIds } : {}),
        ...(attachmentsMeta?.length ? { attachments_meta: attachmentsMeta } : {}),
        ...(thinkingEnabled !== undefined ? { thinking_enabled: thinkingEnabled } : {}),
      }),
      signal,
    },
  );
  return MessageGenerationCreateResponseSchema.parse(raw);
}

export async function getMessageGenerationStatus(
  generationId: string,
  signal?: AbortSignal,
): Promise<MessageGenerationStatusDto> {
  const raw = await http.fetchJson<MessageGenerationStatusDto>(
    CONVERSATIONS.generationStatus(generationId),
    {
      method: "GET",
      signal,
    },
  );
  return MessageGenerationStatusSchema.parse(raw);
}

export async function subscribeMessageGeneration(
  generationId: string,
  onToken: (token: string) => void,
  onDone: (citations?: CitationData[]) => void,
  onAgentEvent?: (event: AgentEvent) => void,
  signal?: AbortSignal,
  fromIndex?: number,
): Promise<void> {
  const response = await fetch(http.url(CONVERSATIONS.generationEvents(generationId, fromIndex)), {
    method: "GET",
    credentials: "include",
    headers: {
      ...authHeaderFromCookie(),
    },
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Generation events request failed: ${response.status}`);
  }
  await consumeGenerationStream(response, onToken, onDone, onAgentEvent, signal);
}

/**
 * 发送流式对话消息（SSE）
 * @description 建立 SSE 连接，逐字符推送 AI 回复。支持 Agent 工具调用事件、
 *              引用数据、笔记创建等丰富事件。若不存在对话则自动创建。
 * @param prompt - 用户消息内容
 * @param onToken - 每接收到一个字符时的回调
 * @param onDone - 流式传输完成时的回调，附带引用数据
 * @param editorContext - 可选的编辑器上下文
 * @param notebookId - 笔记本 ID
 * @param onAgentEvent - Agent 事件回调（思考、工具调用等）
 * @param conversationId - 已有对话 ID（为空则自动创建新对话）
 * @param globalSearch - 是否启用跨笔记本全局搜索
 * @param signal - AbortSignal 用于取消请求
 * @param toolHint - 指定 Agent 优先使用的工具
 * @param attachmentIds - 附件文件 ID 数组
 * @param attachmentsMeta - 附件元信息数组
 * @returns 对话 ID（新建或已有）
 */
export async function sendMessageStream(
  prompt: string,
  onToken: (token: string) => void,
  onDone: (citations?: CitationData[]) => void,
  editorContext?: string,
  notebookId?: string,
  onAgentEvent?: (event: AgentEvent) => void,
  conversationId?: string,
  globalSearch?: boolean,
  signal?: AbortSignal,
  toolHint?: string,
  attachmentIds?: string[],
  attachmentsMeta?: AttachmentMeta[],
  thinkingEnabled?: boolean,
  /** When true, the conversation is tagged as "copilot" and excluded from the chat page list. */
  isCopilot?: boolean,
  onConversationReady?: (conversationId: string) => void,
  onGenerationReady?: (generation: MessageGenerationHandle) => void,
): Promise<string> {
  let convId = conversationId

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // If no existing conversation, create one first
  if (!convId) {
    const createUrl = notebookId
      ? CONVERSATIONS.list(notebookId)
      : CONVERSATIONS.GLOBAL_LIST;
    const convRaw = await http.fetchJson<{ id: string }>(createUrl, {
      method: "POST",
      body: JSON.stringify({ title: prompt.slice(0, 60), source: isCopilot ? "copilot" : "chat" }),
      signal,
    });
    const conv = CreateConversationResponseSchema.parse(convRaw);
    convId = conv.id
    onConversationReady?.(convId)
  }

  const generation = await startMessageGeneration(
    convId,
    prompt,
    {
      globalSearch,
      toolHint,
      attachmentIds,
      attachmentsMeta,
      thinkingEnabled,
    },
    signal,
  );
  onGenerationReady?.(generation);
  await subscribeMessageGeneration(
    generation.generation_id,
    onToken,
    onDone,
    onAgentEvent,
    signal,
  );
  return convId
}

// ─── Artifacts ────────────────────────────────────────────────────────────────

/**
 * 获取笔记本下的所有 AI 生成物
 * @param notebookId - 笔记本 ID
 * @returns 生成物数组
 */
export async function getArtifacts(notebookId: string): Promise<Artifact[]> {
  const data = await http.get<Record<string, unknown>[]>(AI.artifacts(notebookId));
  return data.map(mapArtifact);
}

/**
 * 触发生成 AI 内容物（摘要、FAQ、学习指南等）
 * @param notebookId - 笔记本 ID
 * @param type - 生成物类型
 * @returns 创建的生成物对象
 */
export async function generateArtifact(
  notebookId: string,
  type: "summary" | "faq" | "study_guide" | "briefing"
): Promise<Artifact> {
  const data = await http.post<Record<string, unknown>>(
    AI.generateArtifact(notebookId),
    { type }
  );
  return mapArtifact(data);
}

// ─── Chat suggestions ─────────────────────────────────────────────────────────

/**
 * 获取 AI 推荐的对话建议提示词
 * @returns 建议文本数组
 */
export async function getSuggestions(): Promise<string[]> {
  const data = await http.get<{ suggestions: string[] }>(AI.SUGGESTIONS)
  return data.suggestions
}

// ─── Context greeting ─────────────────────────────────────────────────────────

/** 上下文问候语中的建议项 */
export type GreetingSuggestion = {
  label: string;
  prompt?: string;
  action?: string;
};

/** 上下文感知的问候语和建议 */
export type ContextGreeting = {
  greeting: string;
  suggestions: GreetingSuggestion[];
};

/**
 * 获取基于笔记本内容的上下文问候语和建议
 * @param notebookId - 笔记本 ID
 * @returns 问候语和建议列表
 */
export async function getContextGreeting(notebookId: string): Promise<ContextGreeting> {
  return http.get<ContextGreeting>(AI.contextGreeting(notebookId))
}

// ─── Source suggestions ───────────────────────────────────────────────────────

/** 知识来源的摘要和建议问题 */
export type SourceSuggestions = {
  summary: string | null;
  questions: string[];
};

/**
 * 获取知识来源的摘要和建议问题
 * @param sourceId - 来源 ID
 * @returns 摘要和问题列表
 */
export async function getSourceSuggestions(sourceId: string): Promise<SourceSuggestions> {
  return http.get<SourceSuggestions>(SOURCES.suggestions(sourceId))
}

// ─── Writing context ──────────────────────────────────────────────────────────

/** 写作辅助上下文片段 */
export type WritingContextChunk = {
  source_title: string;
  excerpt: string;
  score: number;
  chunk_id: string;
};

/**
 * 获取编辑器光标位置相关的知识上下文
 * @param notebookId - 笔记本 ID
 * @param textAroundCursor - 光标周围的文本
 * @returns 相关知识片段数组
 */
export async function getWritingContext(
  notebookId: string,
  textAroundCursor: string
): Promise<WritingContextChunk[]> {
  const data = await http.post<{ chunks: WritingContextChunk[] }>(AI.WRITING_CONTEXT, {
    notebook_id: notebookId,
    text_around_cursor: textAroundCursor,
  })
  return data.chunks
}

// ─── Cross-notebook knowledge ─────────────────────────────────────────────────

/** 跨笔记本关联知识片段 */
export type CrossNotebookChunk = {
  notebook_title: string;
  source_title: string;
  excerpt: string;
  score: number;
  chunk_id: string;
  notebook_id: string;
};

/**
 * 获取跨笔记本的关联知识
 * @param notebookId - 当前笔记本 ID
 * @returns 来自其他笔记本的相关知识片段
 */
export async function getRelatedKnowledge(
  notebookId: string
): Promise<CrossNotebookChunk[]> {
  const data = await http.get<{ chunks: CrossNotebookChunk[] }>(
    AI.relatedKnowledge(notebookId)
  )
  return data.chunks
}

// ─── Proactive insights ───────────────────────────────────────────────────────

/** AI 主动洞察条目 */
export type ProactiveInsight = {
  id: string;
  insight_type: string;
  title: string;
  content: string | null;
  notebook_id: string | null;
  is_read: boolean;
  created_at: string;
};

/**
 * 获取 AI 主动洞察列表和未读数量
 * @returns 洞察列表和未读计数
 */
export async function getInsights(): Promise<{
  insights: ProactiveInsight[];
  unread_count: number;
}> {
  return http.get<{
    insights: ProactiveInsight[];
    unread_count: number;
  }>(INSIGHTS.LIST)
}

/**
 * 标记单条洞察为已读
 * @param insightId - 洞察 ID
 */
export async function markInsightRead(insightId: string): Promise<void> {
  await http.post(INSIGHTS.read(insightId))
}

/**
 * 标记所有洞察为已读
 */
export async function markAllInsightsRead(): Promise<void> {
  await http.post(INSIGHTS.READ_ALL)
}

// ─── Deep Research ────────────────────────────────────────────────────────────

/** 深度研究前置澄清问题 */
export interface DrClarifyOption {
  label: string
  value: string
}

export interface DrClarifyQuestion {
  question: string
  options: DrClarifyOption[]
}

export interface DrClarifyResponse {
  questions: DrClarifyQuestion[]
}

/** 获取深度研究前置澄清问题（仅 deep 模式调用） */
export async function getClarifyingQuestions(query: string): Promise<DrClarifyResponse> {
  return http.post<DrClarifyResponse>(AI.DEEP_RESEARCH_CLARIFY, { query })
}

/** 深度研究 SSE 事件 */
export interface DeepResearchEvent {
  type: "plan" | "searching" | "learning" | "writing" | "token" | "done" | "deliverable" | "error" | "report_complete"
  data: Record<string, unknown>
}

export interface DeepResearchWebSource {
  title: string
  url: string
  excerpt?: string
  query?: string
}

/** 深度研究任务状态 */
export interface DeepResearchTaskStatus {
  task_id: string
  conversation_id: string | null
  status: "running" | "done" | "error"
  query: string
  mode: string
  report: string | null
  deliverable: Record<string, unknown> | null
  timeline: Record<string, unknown> | null
  web_sources: DeepResearchWebSource[] | null
  error_message: string | null
  created_at: string | null
  completed_at: string | null
  event_count: number
  buffer_alive: boolean
}

/**
 * 创建深度研究后台任务
 * @returns task_id
 */
export async function createDeepResearch(
  query: string,
  opts: { notebookId?: string; mode?: "quick" | "deep"; clarificationContext?: Array<{ question: string; answer: string }> },
): Promise<{ taskId: string; conversationId: string }> {
  const data = await http.post<{ task_id: string; conversation_id: string }>(
    AI.DEEP_RESEARCH,
    {
      query,
      notebook_id: opts.notebookId ?? null,
      mode: opts.mode ?? "quick",
      clarification_context: opts.clarificationContext ?? null,
    },
  )
  return { taskId: data.task_id, conversationId: data.conversation_id }
}

/**
 * 订阅深度研究事件流 (SSE)
 * @param taskId - 任务 ID
 * @param onEvent - 事件回调
 * @param signal - AbortSignal 用于取消
 * @param fromIndex - 从第 N 个事件开始读取 (断点续传)
 */
export async function subscribeDeepResearch(
  taskId: string,
  onEvent: (e: DeepResearchEvent) => void,
  signal?: AbortSignal,
  fromIndex?: number,
): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const url = http.url(AI.deepResearchEvents(taskId, fromIndex))
  const res = await fetch(url, {
    credentials: "include",
    headers: { ...authHeaderFromCookie() },
    signal,
  })

  if (!res.body) throw new Error(getErrorMessage(new Error("No response body")))

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const raw = trimmed.slice(5).trim()
      if (raw === "[DONE]") return
      try {
        const event = JSON.parse(raw) as DeepResearchEvent
        onEvent(event)
      } catch (error) {
        if (isAbortError(error)) throw error;
      }
    }
  }
}

/**
 * 查询深度研究任务状态（用于刷新后恢复）
 */
export async function getDeepResearchStatus(taskId: string): Promise<DeepResearchTaskStatus> {
  return http.get<DeepResearchTaskStatus>(AI.deepResearchStatus(taskId))
}

export async function saveDeepResearchSources(
  taskId: string,
  targetNotebookId?: string,
): Promise<{ created_count: number; skipped_count: number; target_notebook_id: string }> {
  return http.post(AI.deepResearchSaveSources(taskId), {
    target_notebook_id: targetNotebookId ?? null,
  })
}

/**
 * 启动深度研究流式任务（兼容旧调用方式，内部使用新 API）
 */
export async function startDeepResearch(
  query: string,
  opts: { notebookId?: string; mode?: "quick" | "deep" },
  onEvent: (e: DeepResearchEvent) => void,
  signal?: AbortSignal,
): Promise<{ taskId: string; conversationId: string }> {
  const result = await createDeepResearch(query, opts)
  await subscribeDeepResearch(result.taskId, onEvent, signal)
  return result
}

// ── Human-in-the-Loop: MCP tool approval ──────────────────────────────────────

/**
 * Resolve a pending MCP tool-call approval.
 * @param approvalId  The UUID from the `human_approve_required` SSE event.
 * @param approved    true = allow the tool call, false = reject.
 */
export async function approveToolCall(approvalId: string, approved: boolean): Promise<void> {
  await http.post(CONVERSATIONS.approveTool(approvalId), { approved })
}
