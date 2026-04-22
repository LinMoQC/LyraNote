/**
 * @file 对话与流式聊天服务
 */
import type { HttpClient } from "../lib/client";
import { CONVERSATIONS } from "../lib/routes";
import { mapConversation, mapMessage } from "../lib/mappers";
import { readSseStream } from "../lib/sse";
import type {
  AgentStep,
  CitationData,
  ConversationRecord,
  DiagramData,
  MCPResultData,
  Message,
  MindMapData,
} from "@lyranote/types";

export interface ConversationListParams {
  offset?: number;
  limit?: number;
}

export interface ConversationMessageParams {
  offset?: number;
  limit?: number;
}

export interface ConversationStreamPayload {
  content: string;
  global_search?: boolean;
  tool_hint?: string;
  attachment_ids?: string[];
}

export type ConversationStreamEvent =
  | { type: "token"; content: string }
  | { type: "citations"; citations: CitationData[] }
  | { type: "agent_step"; step: AgentStep }
  | { type: "mind_map"; data: MindMapData | unknown }
  | { type: "diagram"; data: DiagramData | unknown }
  | { type: "mcp_result"; data: MCPResultData | unknown }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "raw"; line: string };

export function createConversationService(http: HttpClient) {
  const getListParams = (
    params: ConversationListParams | ConversationMessageParams = {}
  ) => {
    const queryParams: Record<string, string | number> = {};
    if (params.offset != null) queryParams.offset = params.offset;
    if (params.limit != null) queryParams.limit = params.limit;
    return Object.keys(queryParams).length > 0 ? queryParams : undefined;
  };

  return {
    getConversations: async (
      notebookId: string,
      params: ConversationListParams = {}
    ): Promise<ConversationRecord[]> => {
      const data = await http.get<unknown[]>(CONVERSATIONS.list(notebookId), {
        params: getListParams(params),
      });
      return (data as Record<string, unknown>[]).map(mapConversation);
    },

    getGlobalConversations: async (
      params: ConversationListParams = {}
    ): Promise<ConversationRecord[]> => {
      const data = await http.get<unknown[]>(CONVERSATIONS.GLOBAL_LIST, {
        params: getListParams(params),
      });
      return (data as Record<string, unknown>[]).map(mapConversation);
    },

    createConversation: async (
      notebookId: string,
      title?: string,
      source = "chat"
    ): Promise<ConversationRecord> => {
      const data = await http.post<Record<string, unknown>>(CONVERSATIONS.list(notebookId), {
        title: title ?? null,
        source,
      });
      return mapConversation(data);
    },

    createGlobalConversation: async (
      title?: string
    ): Promise<ConversationRecord> => {
      const data = await http.post<Record<string, unknown>>(CONVERSATIONS.GLOBAL_LIST, {
        title: title ?? null,
      });
      return mapConversation(data);
    },

    deleteConversation: (conversationId: string): Promise<void> =>
      http.delete(CONVERSATIONS.detail(conversationId)),

    getMessages: async (
      conversationId: string,
      params: ConversationMessageParams = {}
    ): Promise<Message[]> => {
      const data = await http.get<unknown[]>(CONVERSATIONS.messages(conversationId), {
        params: getListParams(params),
      });
      return (data as Record<string, unknown>[]).map(mapMessage);
    },

    saveMessage: (
      conversationId: string,
      role: "user" | "assistant",
      content: string,
      citations?: unknown[] | null
    ): Promise<Message> =>
      http.post<Message>(CONVERSATIONS.saveMessage(conversationId), {
        role,
        content,
        citations: citations ?? null,
      }),

    streamMessage: async (
      conversationId: string,
      payload: ConversationStreamPayload,
      onEvent: (event: ConversationStreamEvent) => void,
      opts?: { signal?: AbortSignal }
    ): Promise<void> => {
      const response = await http.stream(CONVERSATIONS.stream(conversationId), payload, {
        signal: opts?.signal,
      });

      await readSseStream(response, (chunk) => {
        switch (chunk.type) {
          case "token":
            onEvent({ type: "token", content: chunk.content });
            break;
          case "citations":
            onEvent({ type: "citations", citations: chunk.citations as CitationData[] });
            break;
          case "agent_step":
            onEvent({ type: "agent_step", step: chunk.step as AgentStep });
            break;
          case "mind_map":
            onEvent({ type: "mind_map", data: chunk.data });
            break;
          case "diagram":
            onEvent({ type: "diagram", data: chunk.data });
            break;
          case "mcp_result":
            onEvent({ type: "mcp_result", data: chunk.data });
            break;
          case "error":
            onEvent({ type: "error", message: chunk.message });
            break;
          case "done":
            onEvent({ type: "done" });
            break;
          case "raw":
            onEvent({ type: "raw", line: chunk.line });
            break;
          default:
            break;
        }
      });
    },

    approveTool: (approvalId: string, approved: boolean): Promise<void> =>
      http.post(CONVERSATIONS.approveTool(approvalId), { approved }),
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
