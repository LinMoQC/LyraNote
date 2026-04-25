import { beforeEach, describe, expect, it, vi } from "vitest";

import { createConversationService } from "../src/services/conversations";
import type { HttpClient } from "../src/lib/client";

function createSseResponse(lines: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines.join("\n") + "\n"));
        controller.close();
      },
    }),
  );
}

describe("createConversationService", () => {
  const http = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    stream: vi.fn(),
  } as unknown as HttpClient;

  beforeEach(() => {
    vi.mocked(http.get).mockReset();
    vi.mocked(http.post).mockReset();
    vi.mocked(http.delete).mockReset();
    vi.mocked(http.stream).mockReset();
  });

  it("parses token/content events and done marker", async () => {
    vi.mocked(http.stream).mockResolvedValue(
      createSseResponse([
        'data: {"type":"token","content":"hello"}',
        'data: {"type":"content","content":" world"}',
        "data: [DONE]",
      ]),
    );

    const service = createConversationService(http);
    const events: unknown[] = [];

    await service.streamMessage("conv-1", { content: "hi" }, (event) => {
      events.push(event);
    });

    expect(events).toEqual([
      { type: "token", content: "hello" },
      { type: "token", content: " world" },
      { type: "done" },
    ]);
  });

  it("maps malformed chunks to raw events and keeps error events", async () => {
    vi.mocked(http.stream).mockResolvedValue(
      createSseResponse([
        "data: not-json",
        'data: {"type":"error","message":"boom"}',
      ]),
    );

    const service = createConversationService(http);
    const events: unknown[] = [];

    await service.streamMessage("conv-2", { content: "hi" }, (event) => {
      events.push(event);
    });

    expect(events).toEqual([
      { type: "raw", line: "not-json" },
      { type: "error", message: "boom" },
    ]);
  });

  it("propagates abort errors from the underlying stream request", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    vi.mocked(http.stream).mockRejectedValue(abortError);

    const service = createConversationService(http);

    await expect(
      service.streamMessage("conv-3", { content: "hi" }, () => undefined, {
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
