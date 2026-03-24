/**
 * @file 对话与流式聊天服务
 */
import type { HttpClient } from "../lib/client";
import { CONVERSATIONS } from "../lib/routes";
import { mapConversation, mapMessage } from "../lib/mappers";
import type { ConversationRecord, Message } from "@lyranote/types";

export interface StreamChatPayload {
  content: string;
  global_search?: boolean;
  tool_hint?: string;
  attachment_ids?: string[];
}

export function createConversationService(http: HttpClient) {
  return {
    getConversations: async (notebookId: string): Promise<ConversationRecord[]> => {
      const data = await http.get<unknown[]>(CONVERSATIONS.list(notebookId));
      return (data as Record<string, unknown>[]).map(mapConversation);
    },

    createConversation: async (
      notebookId: string,
      title: string,
      source = "chat"
    ): Promise<ConversationRecord> => {
      const data = await http.fetchJson<Record<string, unknown>>(
        CONVERSATIONS.list(notebookId),
        {
          method: "POST",
          body: JSON.stringify({ title, source }),
        }
      );
      return mapConversation(data);
    },

    deleteConversation: (conversationId: string): Promise<void> =>
      http.delete(CONVERSATIONS.detail(conversationId)),

    getMessages: async (conversationId: string): Promise<Message[]> => {
      const data = await http.get<unknown[]>(CONVERSATIONS.messages(conversationId));
      return (data as Record<string, unknown>[]).map(mapMessage);
    },

    streamMessage: (
      conversationId: string,
      payload: StreamChatPayload,
      signal?: AbortSignal
    ): Promise<Response> =>
      http.stream(CONVERSATIONS.stream(conversationId), payload, { signal }),

    approveTool: (approvalId: string, approved: boolean): Promise<void> =>
      http.post(CONVERSATIONS.approveTool(approvalId), { approved }),
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
