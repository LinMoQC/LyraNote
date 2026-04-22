import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  cancelMock,
  createConversationMock,
  createGlobalConversationMock,
  streamMessageMock,
} = vi.hoisted(() => ({
  cancelMock: vi.fn(),
  createConversationMock: vi.fn(),
  createGlobalConversationMock: vi.fn(),
  streamMessageMock: vi.fn(),
}))

vi.mock("@/features/chat/use-chat-stream", () => ({
  useChatStream: () => ({
    isStreaming: false,
    streamMessage: streamMessageMock,
    cancel: cancelMock,
  }),
}))

vi.mock("@/lib/api-client", () => ({
  getDesktopConversationService: () => ({
    createConversation: createConversationMock,
  }),
}))

vi.mock("@/services/conversation-service", () => ({
  createGlobalConversation: createGlobalConversationMock,
}))

import { useCopilotStream } from "@/features/editor/use-copilot-stream"

describe("useCopilotStream", () => {
  beforeEach(() => {
    cancelMock.mockReset()
    createConversationMock.mockReset()
    createGlobalConversationMock.mockReset()
    streamMessageMock.mockReset()
  })

  it("creates notebook copilot conversations and reuses chat streaming infrastructure", async () => {
    createConversationMock.mockResolvedValue({ id: "conv-notebook-1" })
    streamMessageMock.mockImplementation(async (_conversationId, _payload, callbacks) => {
      callbacks.onToken?.("生成结果")
    })

    const { result } = renderHook(() => useCopilotStream("notebook-1"))

    await act(async () => {
      await result.current.send("帮我整理")
    })

    expect(createConversationMock).toHaveBeenCalledWith("notebook-1", "AI 帮写", "copilot")
    expect(streamMessageMock).toHaveBeenCalledWith(
      "conv-notebook-1",
      { content: "帮我整理" },
      expect.any(Object),
    )
    expect(result.current.messages).toEqual([
      expect.objectContaining({ role: "user", content: "帮我整理" }),
      expect.objectContaining({ role: "assistant", content: "生成结果" }),
    ])
  })

  it("falls back to global conversations when there is no notebook context", async () => {
    createGlobalConversationMock.mockResolvedValue({ id: "conv-global-1" })
    streamMessageMock.mockImplementation(async (_conversationId, _payload, callbacks) => {
      callbacks.onToken?.("全局回复")
    })

    const { result } = renderHook(() => useCopilotStream())

    await act(async () => {
      await result.current.send("给我一个总结")
    })

    expect(createGlobalConversationMock).toHaveBeenCalledWith("AI 帮写")
    expect(result.current.messages.at(-1)).toEqual(
      expect.objectContaining({ role: "assistant", content: "全局回复" }),
    )
  })
})
