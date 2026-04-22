import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { DesktopChatInputSubmitPayload } from "@/components/chat-input/desktop-chat-input"
import { lyraQueryKeys } from "@/lib/query-keys"
import {
  createGlobalConversation,
  getGlobalConversations,
  getMessages,
} from "@/services/conversation-service"
import { useChatDraftStore } from "@/store/use-chat-draft-store"
import { useChatStream } from "@/features/chat/use-chat-stream"
import type { AgentStep, CitationData, DiagramData, MCPResultData, MindMapData, Message as ServerMessage } from "@/types"

interface ChatPageMessage {
  id: string
  role: "user" | "assistant"
  content: string
  mode?: "cloud" | "offline_cache"
  attachments?: { name: string; url?: string; isImage?: boolean }[]
  citations?: CitationData[]
  agentSteps?: AgentStep[]
  mindMap?: MindMapData
  diagram?: DiagramData
  mcpResult?: MCPResultData
}

let messageCounter = 1
function genMessageId() {
  return `desktop-chat-msg-${messageCounter++}`
}

export function useChatPage({
  initialMessage,
  initialDraftId,
}: {
  initialMessage?: string
  initialDraftId?: string
}) {
  const queryClient = useQueryClient()
  const consumeDraft = useChatDraftStore((state) => state.consumeDraft)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatPageMessage[]>([])
  const [liveAgentSteps, setLiveAgentSteps] = useState<AgentStep[]>([])
  const didAutoSend = useRef(false)
  const stream = useChatStream()

  const conversationsQuery = useQuery({
    queryKey: lyraQueryKeys.conversations.list({ scope: "global" }),
    queryFn: getGlobalConversations,
  })

  const messagesQuery = useQuery({
    queryKey: activeConvId
      ? lyraQueryKeys.conversations.messages(activeConvId)
      : lyraQueryKeys.conversations.messages("idle"),
    queryFn: () => getMessages(activeConvId!),
    enabled: !!activeConvId,
  })

  useEffect(() => {
    if (!messagesQuery.data || stream.isStreaming) return
    setMessages(messagesQuery.data.map((message: ServerMessage) => ({
      id: message.id,
      role: message.role as "user" | "assistant",
      content: message.content,
      citations: message.citations,
      agentSteps: message.agentSteps,
      mindMap: message.mindMap,
      diagram: message.diagram,
      mcpResult: message.mcpResult,
    })))
  }, [messagesQuery.data, stream.isStreaming])

  const createConversationMutation = useMutation({
    mutationFn: (title?: string) => createGlobalConversation(title),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: lyraQueryKeys.conversations.all() })
    },
  })

  const openConversation = useCallback((conversationId: string) => {
    if (conversationId === activeConvId) return
    setActiveConvId(conversationId)
    setMessages([])
  }, [activeConvId])

  const startNewConversation = useCallback(() => {
    stream.cancel()
    setActiveConvId(null)
    setMessages([])
  }, [stream])

  const handleSend = useCallback(async ({ content, attachments }: DesktopChatInputSubmitPayload) => {
    const trimmedContent = content.trim()
    if ((!trimmedContent && attachments.length === 0) || stream.isStreaming) return

    let conversationId = activeConvId
    if (!conversationId) {
      const created = await createConversationMutation.mutateAsync(trimmedContent.slice(0, 40))
      conversationId = created.id
      setActiveConvId(created.id)
    }

    const userMessage: ChatPageMessage = {
      id: genMessageId(),
      role: "user",
      content: trimmedContent,
      attachments: attachments.map((attachment) => ({
        name: attachment.file.name,
        url: attachment.previewUrl,
        isImage: attachment.file.type.startsWith("image/"),
      })),
    }
    const assistantId = genMessageId()

    setLiveAgentSteps([])
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ])

    await stream.streamMessage(
      conversationId,
      {
        content: trimmedContent,
        attachment_ids: attachments
          .map((attachment) => attachment.serverId)
          .filter(Boolean) as string[],
      },
      {
        onToken(token) {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, content: message.content + token }
              : message
          )))
        },
        onCitations(citations) {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, citations }
              : message
          )))
        },
        onMode(mode) {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, mode: mode === "offline_cache" ? "offline_cache" : "cloud" }
              : message
          )))
        },
        onAgentStep(step) {
          setLiveAgentSteps((current) => [...current, step])
        },
        onMindMap(data) {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, mindMap: data }
              : message
          )))
        },
        onDiagram(data) {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, diagram: data }
              : message
          )))
        },
        onMcpResult(data) {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, mcpResult: data }
              : message
          )))
        },
        onError(message) {
          setMessages((current) => current.map((item) => (
            item.id === assistantId
              ? { ...item, content: message || "请求失败，请稍后重试。" }
              : item
          )))
        },
        async onDone() {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: lyraQueryKeys.conversations.all() }),
            queryClient.invalidateQueries({
              queryKey: lyraQueryKeys.conversations.messages(conversationId),
            }),
          ])
        },
      },
    )
  }, [activeConvId, createConversationMutation, queryClient, stream])

  useEffect(() => {
    if (didAutoSend.current || conversationsQuery.isLoading) return

    if (initialMessage) {
      didAutoSend.current = true
      void handleSend({ content: initialMessage, attachments: [] })
      return
    }

    if (initialDraftId) {
      const draft = consumeDraft(initialDraftId)
      if (!draft) return
      didAutoSend.current = true
      void handleSend(draft)
    }
  }, [
    consumeDraft,
    conversationsQuery.isLoading,
    handleSend,
    initialDraftId,
    initialMessage,
  ])

  return {
    activeConvId,
    conversations: conversationsQuery.data ?? [],
    isStreaming: stream.isStreaming,
    liveAgentSteps,
    loadingConvs: conversationsQuery.isLoading,
    loadingMsgs: messagesQuery.isLoading,
    messages,
    openConversation,
    startNewConversation,
    handleSend,
    cancelStreaming: stream.cancel,
    lastMessageId: useMemo(() => messages[messages.length - 1]?.id, [messages]),
  }
}
