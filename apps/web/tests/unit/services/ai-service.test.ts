import { beforeEach, describe, expect, it, vi } from "vitest"

import { CONVERSATIONS } from "@/lib/api-routes"
import { sendMessageStream } from "@/services/ai-service"
import { http, resetHttpClientMocks } from "@test/mocks/http-client"

vi.mock("@/lib/http-client", () => import("@test/mocks/http-client"))

function makeEmptyStreamResponse() {
  return {
    body: {
      getReader: () => ({
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      }),
    },
  }
}

describe("ai-service thinking payload", () => {
  const conversationId = "11111111-1111-4111-8111-111111111111"

  beforeEach(() => {
    resetHttpClientMocks()
    http.fetchJson.mockResolvedValue({ id: conversationId })
    http.stream.mockResolvedValue(makeEmptyStreamResponse())
  })

  it("sends thinking_enabled when provided", async () => {
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

    expect(http.stream).toHaveBeenCalledWith(
      CONVERSATIONS.stream(conversationId),
      expect.objectContaining({
        content: "你好",
        global_search: true,
        thinking_enabled: true,
      }),
      { signal: undefined },
    )
  })

  it("omits thinking_enabled when not provided", async () => {
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

    expect(http.stream).toHaveBeenCalledWith(
      CONVERSATIONS.stream(conversationId),
      expect.not.objectContaining({
        thinking_enabled: expect.anything(),
      }),
      { signal: undefined },
    )
  })
})
