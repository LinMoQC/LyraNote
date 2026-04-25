/**
 * @file 通用 SSE 流读取工具
 * @description 基于 fetch + ReadableStream，兼容 Web / Desktop（Tauri webview）/ React Native。
 *              不依赖浏览器 EventSource API，三端通用。
 */

export type SseChunk =
  | { type: "token"; content: string }
  | { type: "citations"; citations: unknown[] }
  | { type: "agent_step"; step: unknown }
  | { type: "mind_map"; data: unknown }
  | { type: "diagram"; data: unknown }
  | { type: "mcp_result"; data: unknown }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "raw"; line: string };

/**
 * 读取 SSE 响应流，逐行解析并通过 onChunk 回调返回结构化数据。
 *
 * @param response - `fetch` 返回的 Response（需已通过 ok 检查）
 * @param onChunk - 每个 SSE 事件的处理回调
 */
export async function readSseStream(
  response: Response,
  onChunk: (chunk: SseChunk) => void
): Promise<void> {
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;

      const raw = line.slice(5).trim();
      if (raw === "[DONE]") {
        onChunk({ type: "done" });
        return;
      }
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        onChunk(parseSseEvent(parsed));
      } catch {
        onChunk({ type: "raw", line: raw });
      }
    }
  }
}

function parseSseEvent(data: Record<string, unknown>): SseChunk {
  if (
    (data.type === "token" || data.type === "text" || data.type === "content") &&
    typeof data.content === "string"
  ) {
    return { type: "token", content: data.content };
  }
  if (data.type === "citations" && Array.isArray(data.citations)) {
    return { type: "citations", citations: data.citations };
  }
  if (
    data.type === "agent_step" ||
    data.type === "thought" ||
    data.type === "tool_call" ||
    data.type === "tool_result"
  ) {
    return { type: "agent_step", step: data.step ?? data };
  }
  if (data.type === "mind_map") {
    return { type: "mind_map", data: data.data ?? data };
  }
  if (data.type === "diagram") {
    return { type: "diagram", data: data.data ?? data };
  }
  if (data.type === "mcp_result") {
    return { type: "mcp_result", data: data.data ?? data };
  }
  if (data.type === "error" && typeof data.message === "string") {
    return { type: "error", message: data.message };
  }
  return { type: "raw", line: JSON.stringify(data) };
}
