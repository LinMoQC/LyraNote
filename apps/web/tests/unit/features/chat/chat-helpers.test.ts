import { describe, expect, it } from "vitest";

import {
  findLatestStreamingAssistantMessage,
  mergeServerAndLocalMessages,
} from "@/features/chat/chat-helpers";
import type { LocalMessage } from "@/features/chat/chat-types";

function makeMessage(overrides: Partial<LocalMessage>): LocalMessage {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    role: "user",
    content: "hello",
    timestamp: new Date("2026-04-01T16:00:00.000Z"),
    ...overrides,
  };
}

describe("mergeServerAndLocalMessages", () => {
  it("dedupes user drafts already persisted on the server and keeps unresolved assistant drafts", () => {
    const serverMessages = [
      makeMessage({
        id: "11111111-1111-4111-8111-111111111111",
        role: "user",
        content: "你好",
      }),
    ];

    const localDrafts = [
      makeMessage({
        id: "local-1",
        role: "user",
        content: "你好",
      }),
      makeMessage({
        id: "local-asst-1",
        role: "assistant",
        content: "正在思考中",
        timestamp: new Date("2026-04-01T16:00:01.000Z"),
      }),
    ];

    const result = mergeServerAndLocalMessages(serverMessages, localDrafts);

    expect(result.messages).toHaveLength(2);
    expect(result.messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(result.unresolvedDrafts).toEqual([
      expect.objectContaining({ id: "local-asst-1", role: "assistant" }),
    ]);
  });

  it("finds the newest streaming assistant that can be resumed", () => {
    const messages = [
      makeMessage({
        id: "11111111-1111-4111-8111-111111111111",
        role: "assistant",
        status: "completed",
        generationId: "aaaaaaa1-1111-4111-8111-111111111111",
      }),
      makeMessage({
        id: "22222222-2222-4222-8222-222222222222",
        role: "assistant",
        status: "streaming",
        generationId: "bbbbbbb2-2222-4222-8222-222222222222",
        timestamp: new Date("2026-04-01T16:00:02.000Z"),
      }),
    ];

    expect(findLatestStreamingAssistantMessage(messages)).toEqual(
      expect.objectContaining({
        id: "22222222-2222-4222-8222-222222222222",
        generationId: "bbbbbbb2-2222-4222-8222-222222222222",
      }),
    );
  });
});
