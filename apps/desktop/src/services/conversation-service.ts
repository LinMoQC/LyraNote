import {
  type ConversationStreamEvent,
  type ConversationStreamPayload,
} from "@lyranote/api-client"
import type { ConversationRecord, Message } from "@lyranote/types"

import { getDesktopHttpClient, getDesktopConversationService } from "@/lib/api-client"
import type {
  AgentStep,
  CitationData,
  DesktopLocalAnswer,
  DiagramData,
  MCPResultData,
  MindMapData,
} from "@/types"

export type StreamMessagePayload = ConversationStreamPayload

export interface StreamMessageEvent {
  type: "token" | "citations" | "agent_step" | "mind_map" | "diagram" | "mcp_result" | "done" | "error" | "raw"
  content?: string
  citations?: CitationData[]
  step?: AgentStep
  data?: MindMapData | DiagramData | MCPResultData | unknown
  message?: string
  line?: string
}

export async function getGlobalConversations(): Promise<ConversationRecord[]> {
  return getDesktopConversationService().getGlobalConversations()
}

export async function createGlobalConversation(title?: string): Promise<ConversationRecord> {
  return getDesktopConversationService().createGlobalConversation(title)
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return getDesktopConversationService().getMessages(conversationId)
}

export async function streamMessage(
  conversationId: string,
  payload: ConversationStreamPayload,
  onEvent: (event: StreamMessageEvent) => void,
  signal?: AbortSignal,
) {
  await getDesktopConversationService().streamMessage(
    conversationId,
    payload,
    (event) => onEvent(mapStreamEvent(event)),
    { signal },
  )
}

export async function answerLocally(
  query: string,
  options: {
    notebookId?: string | null
    sourceId?: string | null
    limit?: number
  } = {},
): Promise<DesktopLocalAnswer> {
  return getDesktopHttpClient().post<DesktopLocalAnswer>("/desktop/chat/local-answer", {
    query,
    notebook_id: options.notebookId ?? null,
    source_id: options.sourceId ?? null,
    limit: options.limit ?? 5,
  })
}

function mapStreamEvent(event: ConversationStreamEvent): StreamMessageEvent {
  switch (event.type) {
    case "token":
      return { type: "token", content: event.content }
    case "citations":
      return { type: "citations", citations: event.citations as CitationData[] }
    case "agent_step":
      return { type: "agent_step", step: event.step as AgentStep }
    case "mind_map":
      return { type: "mind_map", data: event.data as MindMapData }
    case "diagram":
      return { type: "diagram", data: event.data as DiagramData }
    case "mcp_result":
      return { type: "mcp_result", data: event.data as MCPResultData }
    case "error":
      return { type: "error", message: event.message }
    case "done":
      return { type: "done" }
    case "raw":
      return { type: "raw", line: event.line }
  }
}
