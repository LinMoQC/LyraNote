import { beforeEach, describe, expect, it, vi } from "vitest"

const { httpMock } = vi.hoisted(() => ({
  httpMock: {
    get: vi.fn(),
    post: vi.fn(),
    fetchJson: vi.fn(),
  },
}))

vi.mock("@/lib/api-client", () => ({
  getDesktopHttpClient: () => httpMock,
  getDesktopConversationService: () => ({
    getGlobalConversations: vi.fn(),
    createGlobalConversation: vi.fn(),
    getMessages: vi.fn(),
    streamMessage: vi.fn(),
  }),
}))

import { answerLocally } from "@/services/conversation-service"

describe("conversation-service", () => {
  beforeEach(() => {
    httpMock.post.mockReset()
  })

  it("calls the desktop local-answer endpoint", async () => {
    httpMock.post.mockResolvedValue({
      mode: "offline_cache",
      query: "transformer",
      answer: "local answer",
      citations: [],
    })

    await expect(answerLocally("transformer", { limit: 3 })).resolves.toEqual({
      mode: "offline_cache",
      query: "transformer",
      answer: "local answer",
      citations: [],
    })

    expect(httpMock.post).toHaveBeenCalledWith("/desktop/chat/local-answer", {
      query: "transformer",
      notebook_id: null,
      source_id: null,
      limit: 3,
    })
  })
})
