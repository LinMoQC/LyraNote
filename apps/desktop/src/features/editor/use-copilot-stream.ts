import { useCallback, useRef, useState } from "react"

import { getDesktopConversationService } from "@/lib/api-client"
import { useChatStream } from "@/features/chat/use-chat-stream"
import { createGlobalConversation } from "@/services/conversation-service"

interface CopilotMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

let messageCounter = 1
function genMessageId() {
  return `desktop-copilot-msg-${messageCounter++}`
}

export function useCopilotStream(notebookId?: string) {
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const stream = useChatStream()
  const conversationIdRef = useRef<string | null>(null)
  conversationIdRef.current = conversationId

  const ensureConversation = useCallback(async () => {
    if (conversationIdRef.current) return conversationIdRef.current

    let nextConversationId: string
    if (notebookId) {
      const created = await getDesktopConversationService().createConversation(
        notebookId,
        "AI 帮写",
        "copilot",
      )
      nextConversationId = created.id
    } else {
      const created = await createGlobalConversation("AI 帮写")
      nextConversationId = created.id
    }

    setConversationId(nextConversationId)
    return nextConversationId
  }, [notebookId])

  const send = useCallback(async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || stream.isStreaming) return

    const activeConversationId = await ensureConversation()
    const assistantId = genMessageId()
    setMessages((current) => [
      ...current,
      { id: genMessageId(), role: "user", content: trimmed },
      { id: assistantId, role: "assistant", content: "" },
    ])

    await stream.streamMessage(
      activeConversationId,
      { content: trimmed },
      {
        onToken(token) {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, content: message.content + token }
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
      },
    )
  }, [ensureConversation, stream])

  const clear = useCallback(() => {
    stream.cancel()
    setMessages([])
    setConversationId(null)
  }, [stream])

  return {
    messages,
    isStreaming: stream.isStreaming,
    send,
    clear,
    cancel: stream.cancel,
  }
}
