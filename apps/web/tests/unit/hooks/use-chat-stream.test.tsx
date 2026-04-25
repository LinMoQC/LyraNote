import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { type ReactNode, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatStream } from "@/hooks/use-chat-stream";
import { useStreamLifecycle } from "@/hooks/use-stream-lifecycle";
import type { LocalMessage } from "@/features/chat/chat-types";
import type { DrProgress } from "@/components/deep-research/deep-research-progress";
import { createTestQueryClient } from "@test/utils/create-test-query-client";

const {
  cancelMessageGenerationMock,
  getMessagesMock,
  notifyErrorMock,
  notifySuccessMock,
  saveActiveConversationMock,
  sendMessageStreamMock,
} = vi.hoisted(() => ({
  cancelMessageGenerationMock: vi.fn(),
  getMessagesMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  saveActiveConversationMock: vi.fn(),
  sendMessageStreamMock: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/services/ai-service", () => ({
  cancelMessageGeneration: cancelMessageGenerationMock,
  getMessageGenerationStatus: vi.fn(),
  sendMessageStream: sendMessageStreamMock,
  subscribeMessageGeneration: vi.fn(),
}))

vi.mock("@/services/conversation-service", () => ({
  getMessages: getMessagesMock,
}))

vi.mock("@/features/chat/chat-persistence", () => ({
  saveActiveConversation: saveActiveConversationMock,
}))

vi.mock("@/lib/notify", () => ({
  notifyError: notifyErrorMock,
  notifySuccess: notifySuccessMock,
}))

function createWrapper() {
  const queryClient = createTestQueryClient()

  return function Wrapper({ children }: { children?: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

function useChatStreamHarness() {
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [input, setInput] = useState("告诉我2026年Agent的最新研究成果")
  const [streaming, setStreaming] = useState(false)
  const [activeConvId, setActiveConvId] = useState<string | null>("conv-1")
  const [, setDrProgress] = useState<DrProgress | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const streamLifecycle = useStreamLifecycle()

  const chat = useChatStream({
    activeConvId,
    input,
    streaming,
    isDeepResearch: false,
    streamLifecycle,
    streamAbortRef,
    handleDeepResearch: vi.fn(async () => {}),
    setMessages,
    setInput,
    setStreaming,
    setActiveConvId,
    setDrProgress,
    isThinkingModel: false,
    thinkingEnabled: false,
  })

  return {
    ...chat,
    messages,
    streaming,
  }
}

describe("useChatStream", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    cancelMessageGenerationMock.mockReset()
    sendMessageStreamMock.mockReset()
    getMessagesMock.mockReset()
    notifyErrorMock.mockReset()
    notifySuccessMock.mockReset()
    saveActiveConversationMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps draining later tokens after an empty content_replace event", async () => {
    let resolveStream: ((value: string) => void) | null = null

    sendMessageStreamMock.mockImplementation(async (
      _prompt: string,
      onToken: (token: string) => void,
      _onDone: (citations?: unknown[]) => void,
      _editorContext: unknown,
      _notebookId: unknown,
      onAgentEvent?: (event: { type: string; content?: string }) => void,
    ) => new Promise<string>((resolve) => {
      onAgentEvent?.({ type: "content_replace", content: "" })
      onToken("最新研究成果")
      resolveStream = resolve
    }))

    const { result } = renderHook(() => useChatStreamHarness(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      void result.current.handleSend()
      await Promise.resolve()
    })

    expect(result.current.messages).toHaveLength(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30)
    })

    expect(result.current.messages.at(-1)?.role).toBe("assistant")
    expect(result.current.messages.at(-1)?.content).toBe("最新研究成果")

    await act(async () => {
      resolveStream?.("conv-1")
      await Promise.resolve()
    })
  })

  it("cancels the durable generation when the user stops streaming", async () => {
    const generationId = "22222222-2222-4222-8222-222222222222"

    sendMessageStreamMock.mockImplementation(async (
      _prompt: string,
      _onToken: (token: string) => void,
      _onDone: (citations?: unknown[]) => void,
      _editorContext: unknown,
      _notebookId: unknown,
      _onAgentEvent: unknown,
      _conversationId: unknown,
      _globalSearch: unknown,
      signal?: AbortSignal,
      _toolHint?: unknown,
      _attachmentIds?: unknown,
      _attachmentsMeta?: unknown,
      _thinkingEnabled?: unknown,
      _isCopilot?: unknown,
      _onConversationReady?: unknown,
      onGenerationReady?: (generation: {
        generation_id: string
        conversation_id: string
        user_message_id: string
        assistant_message_id: string
      }) => void,
    ) => new Promise<string>((_resolve, reject) => {
      onGenerationReady?.({
        generation_id: generationId,
        conversation_id: "conv-1",
        user_message_id: "44444444-4444-4444-8444-444444444444",
        assistant_message_id: "33333333-3333-4333-8333-333333333333",
      })
      signal?.addEventListener("abort", () => {
        const error = new DOMException("Aborted", "AbortError")
        reject(error)
      }, { once: true })
    }))

    cancelMessageGenerationMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useChatStreamHarness(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      void result.current.handleSend()
      await Promise.resolve()
    })

    expect(result.current.streaming).toBe(true)
    expect(result.current.messages).toHaveLength(2)

    await act(async () => {
      result.current.handleCancelStreaming()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(cancelMessageGenerationMock).toHaveBeenCalledWith(generationId)
    expect(result.current.streaming).toBe(false)
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]?.role).toBe("user")
  })
})
