import { beforeEach, describe, expect, it, vi } from "vitest"

import { CONVERSATIONS } from "@/lib/api-routes"
import {
  cancelMessageGeneration,
  getMessageGenerationStatus,
  saveDeepResearchSources,
  sendMessageStream,
  startMessageGeneration,
  subscribeMessageGeneration,
} from "@/services/ai-service"
import { http, resetHttpClientMocks } from "@test/mocks/http-client"

vi.mock("@/lib/http-client", () => import("@test/mocks/http-client"))

function makeEmptyStreamResponse() {
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      }),
    },
  }
}

describe("ai-service thinking payload", () => {
  const conversationId = "11111111-1111-4111-8111-111111111111"
  const generationId = "22222222-2222-4222-8222-222222222222"
  const assistantMessageId = "33333333-3333-4333-8333-333333333333"
  const fetchMock = vi.fn()

  beforeEach(() => {
    resetHttpClientMocks()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(makeEmptyStreamResponse())
    vi.stubGlobal("fetch", fetchMock)
  })

  it("sends thinking_enabled when provided", async () => {
    http.fetchJson
      .mockResolvedValueOnce({ id: conversationId })
      .mockResolvedValueOnce({
        generation_id: generationId,
        conversation_id: conversationId,
        user_message_id: "44444444-4444-4444-8444-444444444444",
        assistant_message_id: assistantMessageId,
      })

    await sendMessageStream(
      "你好",
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    )

    const [, requestInit] = http.fetchJson.mock.calls[1] ?? []
    expect(http.fetchJson).toHaveBeenNthCalledWith(
      2,
      CONVERSATIONS.startGeneration(conversationId),
      expect.objectContaining({ method: "POST" }),
    )
    expect(JSON.parse(requestInit.body as string)).toMatchObject({
      content: "你好",
      global_search: true,
      thinking_enabled: true,
    })
  })

  it("startMessageGeneration posts the durable generation payload", async () => {
    http.fetchJson.mockResolvedValueOnce({
      generation_id: generationId,
      conversation_id: conversationId,
      user_message_id: "44444444-4444-4444-8444-444444444444",
      assistant_message_id: assistantMessageId,
    })

    await startMessageGeneration(conversationId, "你好", {
      globalSearch: true,
      thinkingEnabled: true,
    })

    expect(http.fetchJson).toHaveBeenCalledWith(
      CONVERSATIONS.startGeneration(conversationId),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "你好",
          global_search: true,
          thinking_enabled: true,
        }),
      }),
    )
  })

  it("omits thinking_enabled when not provided", async () => {
    http.fetchJson
      .mockResolvedValueOnce({ id: conversationId })
      .mockResolvedValueOnce({
        generation_id: generationId,
        conversation_id: conversationId,
        user_message_id: "44444444-4444-4444-8444-444444444444",
        assistant_message_id: assistantMessageId,
      })

    await sendMessageStream(
      "你好",
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    )

    expect(http.fetchJson).toHaveBeenNthCalledWith(
      2,
      CONVERSATIONS.startGeneration(conversationId),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "你好",
          global_search: true,
        }),
      }),
    )
  })

  it("calls onConversationReady when a new conversation is created", async () => {
    const onConversationReady = vi.fn()
    const onGenerationReady = vi.fn()
    http.fetchJson
      .mockResolvedValueOnce({ id: conversationId })
      .mockResolvedValueOnce({
        generation_id: generationId,
        conversation_id: conversationId,
        user_message_id: "44444444-4444-4444-8444-444444444444",
        assistant_message_id: assistantMessageId,
      })

    await sendMessageStream(
      "你好",
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      onConversationReady,
      onGenerationReady,
    )

    expect(onConversationReady).toHaveBeenCalledWith(conversationId)
    expect(onGenerationReady).toHaveBeenCalledWith(expect.objectContaining({
      generation_id: generationId,
      assistant_message_id: assistantMessageId,
    }))
  })

  it("subscribes to generation events over GET SSE", async () => {
    await subscribeMessageGeneration(generationId, vi.fn(), vi.fn(), vi.fn())

    expect(fetchMock).toHaveBeenCalledWith(
      CONVERSATIONS.generationEvents(generationId, undefined),
      expect.objectContaining({
        method: "GET",
      }),
    )
  })

  it("fetches generation status from the new endpoint", async () => {
    http.fetchJson.mockResolvedValueOnce({
      generation_id: generationId,
      conversation_id: conversationId,
      user_message_id: "44444444-4444-4444-8444-444444444444",
      assistant_message_id: assistantMessageId,
      status: "running",
      model: "test-model",
      error_message: null,
      last_event_index: 3,
      assistant_message: null,
      created_at: "2026-04-01T00:00:00Z",
      completed_at: null,
    })

    const status = await getMessageGenerationStatus(generationId)

    expect(status.status).toBe("running")
    expect(http.fetchJson).toHaveBeenCalledWith(
      CONVERSATIONS.generationStatus(generationId),
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("deletes the durable generation when cancelling", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

    await cancelMessageGeneration(generationId)

    expect(fetchMock).toHaveBeenCalledWith(
      CONVERSATIONS.cancelGeneration(generationId),
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        keepalive: true,
      }),
    )
  })

  it("posts deep research source-save requests", async () => {
    http.post.mockResolvedValueOnce({
      created_count: 2,
      skipped_count: 1,
      target_notebook_id: "55555555-5555-4555-8555-555555555555",
    })

    const result = await saveDeepResearchSources("task-1", "nb-1")

    expect(result.created_count).toBe(2)
    expect(http.post).toHaveBeenCalledWith(
      "/ai/deep-research/task-1/save-sources",
      { target_notebook_id: "nb-1" },
    )
  })
})
