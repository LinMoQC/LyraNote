import { useCallback, useRef, useState } from "react"

import {
  answerLocally,
  streamMessage as streamConversationMessage,
  type StreamMessagePayload,
} from "@/services/conversation-service"
import type { AgentStep, CitationData, DiagramData, MCPResultData, MindMapData } from "@/types"

interface StreamCallbacks {
  onToken?: (token: string) => void
  onCitations?: (citations: CitationData[]) => void
  onMode?: (mode: string) => void
  onAgentStep?: (step: AgentStep) => void
  onMindMap?: (data: MindMapData) => void
  onDiagram?: (data: DiagramData) => void
  onMcpResult?: (data: MCPResultData) => void
  onDone?: () => void
  onError?: (message: string) => void
}

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  const streamMessage = useCallback(async (
    conversationId: string,
    payload: StreamMessagePayload,
    callbacks: StreamCallbacks = {},
  ) => {
    const controller = new AbortController()
    abortRef.current = controller
    setIsStreaming(true)
    let receivedToken = false
    let fallbackTriggered = false

    const runOfflineFallback = async (message?: string) => {
      if (fallbackTriggered || !payload.content.trim()) {
        if (message) callbacks.onError?.(message)
        return
      }
      fallbackTriggered = true
      try {
        const localAnswer = await answerLocally(payload.content)
        callbacks.onMode?.(localAnswer.mode)
        callbacks.onToken?.(localAnswer.answer)
        if (localAnswer.citations.length > 0) {
          callbacks.onCitations?.(localAnswer.citations as CitationData[])
        }
        callbacks.onDone?.()
      } catch (fallbackError) {
        callbacks.onError?.(
          message
            || (fallbackError as Error)?.message
            || "请求失败，请稍后重试。",
        )
      }
    }

    try {
      await streamConversationMessage(
        conversationId,
        payload,
        (event) => {
          switch (event.type) {
            case "token":
              receivedToken = true
              callbacks.onToken?.(event.content ?? "")
              break
            case "citations":
              callbacks.onCitations?.(event.citations ?? [])
              break
            case "agent_step":
              if (event.step) callbacks.onAgentStep?.(event.step)
              break
            case "mind_map":
              callbacks.onMindMap?.(event.data as MindMapData)
              break
            case "diagram":
              callbacks.onDiagram?.(event.data as DiagramData)
              break
            case "mcp_result":
              callbacks.onMcpResult?.(event.data as MCPResultData)
              break
            case "error":
              if (!receivedToken) {
                void runOfflineFallback(event.message ?? "云端回答失败，已切换到本地检索模式。")
                break
              }
              callbacks.onError?.(event.message ?? "请求失败，请稍后重试。")
              break
            case "done":
              if (!fallbackTriggered) {
                callbacks.onDone?.()
              }
              break
            default:
              break
          }
        },
        controller.signal,
      )
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        if (!receivedToken) {
          await runOfflineFallback((error as Error)?.message || "云端回答失败，已切换到本地检索模式。")
        } else {
          callbacks.onError?.((error as Error)?.message || "请求失败，请稍后重试。")
        }
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      setIsStreaming(false)
    }
  }, [])

  return {
    isStreaming,
    streamMessage,
    cancel,
  }
}
