import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { streamMessageMock } = vi.hoisted(() => ({
  streamMessageMock: vi.fn(),
}))

const { answerLocallyMock } = vi.hoisted(() => ({
  answerLocallyMock: vi.fn(),
}))

vi.mock("@/services/conversation-service", () => ({
  streamMessage: streamMessageMock,
  answerLocally: answerLocallyMock,
}))

import { useChatStream } from "@/features/chat/use-chat-stream"

describe("useChatStream", () => {
  beforeEach(() => {
    streamMessageMock.mockReset()
    answerLocallyMock.mockReset()
  })

  it("forwards stream events to callbacks and clears streaming state", async () => {
    streamMessageMock.mockImplementation(async (_conversationId, _payload, onEvent) => {
      onEvent({ type: "token", content: "你好" })
      onEvent({ type: "citations", citations: [{ source_id: "s1" }] })
      onEvent({ type: "done" })
    })

    const onToken = vi.fn()
    const onCitations = vi.fn()
    const onDone = vi.fn()

    const { result } = renderHook(() => useChatStream())

    await act(async () => {
      await result.current.streamMessage(
        "conv-1",
        { content: "hello" },
        { onToken, onCitations, onDone },
      )
    })

    expect(onToken).toHaveBeenCalledWith("你好")
    expect(onCitations).toHaveBeenCalledWith([{ source_id: "s1" }])
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(result.current.isStreaming).toBe(false)
  })

  it("swallows abort errors when cancelling an in-flight stream", async () => {
    let activeSignal: AbortSignal | undefined
    streamMessageMock.mockImplementation(async (_conversationId, _payload, _onEvent, signal) => {
      activeSignal = signal
      return new Promise<void>((resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("Aborted")
          error.name = "AbortError"
          reject(error)
          resolve()
        })
      })
    })

    const onError = vi.fn()
    const { result } = renderHook(() => useChatStream())

    let streamPromise: Promise<void> | undefined
    await act(async () => {
      streamPromise = result.current.streamMessage("conv-2", { content: "hello" }, { onError })
      await Promise.resolve()
    })

    expect(result.current.isStreaming).toBe(true)

    await act(async () => {
      result.current.cancel()
      await streamPromise
    })

    expect(activeSignal?.aborted).toBe(true)
    expect(onError).not.toHaveBeenCalled()
    expect(result.current.isStreaming).toBe(false)
  })

  it("falls back to local answer when the stream request fails before tokens arrive", async () => {
    streamMessageMock.mockRejectedValue(new Error("upstream failed"))
    answerLocallyMock.mockResolvedValue({
      mode: "offline_cache",
      query: "hello",
      answer: "local answer",
      citations: [{ source_id: "s1", chunk_id: "c1", excerpt: "quote" }],
    })

    const onToken = vi.fn()
    const onCitations = vi.fn()
    const onDone = vi.fn()
    const onMode = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useChatStream())

    await act(async () => {
      await result.current.streamMessage(
        "conv-3",
        { content: "hello" },
        { onToken, onCitations, onDone, onError, onMode },
      )
    })

    expect(answerLocallyMock).toHaveBeenCalledWith("hello")
    expect(onMode).toHaveBeenCalledWith("offline_cache")
    expect(onToken).toHaveBeenCalledWith("local answer")
    expect(onCitations).toHaveBeenCalledWith([{ source_id: "s1", chunk_id: "c1", excerpt: "quote" }])
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(result.current.isStreaming).toBe(false)
  })

  it("falls back to local answer when the server emits an early error event", async () => {
    streamMessageMock.mockImplementation(async (_conversationId, _payload, onEvent) => {
      onEvent({ type: "error", message: "provider failed" })
    })
    answerLocallyMock.mockResolvedValue({
      mode: "offline_cache",
      query: "hello",
      answer: "offline summary",
      citations: [],
    })

    const onToken = vi.fn()
    const onDone = vi.fn()
    const onMode = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useChatStream())

    await act(async () => {
      await result.current.streamMessage(
        "conv-4",
        { content: "hello" },
        { onToken, onDone, onError, onMode },
      )
      await Promise.resolve()
    })

    expect(answerLocallyMock).toHaveBeenCalledWith("hello")
    expect(onMode).toHaveBeenCalledWith("offline_cache")
    expect(onToken).toHaveBeenCalledWith("offline summary")
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(result.current.isStreaming).toBe(false)
  })
})
