import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TraceDetailPage } from "@/features/traces/trace-detail-page";
import { getTraceDetail } from "@/services/monitoring-service";

vi.mock("@/components/protected-view", () => ({
  ProtectedView: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/services/monitoring-service", async () => {
  const actual = await vi.importActual<typeof import("@/services/monitoring-service")>(
    "@/services/monitoring-service",
  );
  return {
    ...actual,
    getTraceDetail: vi.fn(),
  };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TraceDetailPage traceId="trace-1" />
    </QueryClientProvider>,
  );
}

describe("TraceDetailPage", () => {
  beforeEach(() => {
    vi.mocked(getTraceDetail).mockReset();
  });

  it("renders input, llm calls, tools, and output sections", async () => {
    const user = userEvent.setup();

    vi.mocked(getTraceDetail).mockResolvedValue({
      trace_id: "trace-1",
      runs: [
        {
          id: "run-1",
          trace_id: "trace-1",
          run_type: "chat_generation",
          name: "chat.generation",
          status: "done",
          conversation_id: "conv-1",
          generation_id: "gen-1",
          task_id: null,
          task_run_id: null,
          notebook_id: null,
          duration_ms: 2300,
          error_message: null,
          metadata: {
            query_snapshot: {
              raw_preview: "用户问题",
              char_count: 4,
              sha256: "1234567890ab",
              redaction_applied: false,
              truncated: false,
            },
            final_answer_snapshot: {
              raw_preview: "最终回答",
              char_count: 4,
              sha256: "abcdef123456",
              redaction_applied: false,
              truncated: false,
            },
            reasoning_snapshot: {
              raw_preview: "推理摘要",
              char_count: 4,
              sha256: "fedcba654321",
              redaction_applied: false,
              truncated: false,
            },
          },
          started_at: "2026-04-02T10:00:00+00:00",
          finished_at: "2026-04-02T10:00:02+00:00",
        },
      ],
      spans: [
        {
          id: "span-1",
          run_id: "run-1",
          trace_id: "trace-1",
          span_name: "chat.llm.stream",
          status: "success",
          duration_ms: 1500,
          error_message: null,
          metadata: {},
          started_at: "2026-04-02T10:00:00+00:00",
          finished_at: "2026-04-02T10:00:01+00:00",
        },
      ],
      llm_calls: [
        {
          id: "llm-1",
          run_id: "run-1",
          trace_id: "trace-1",
          call_type: "stream_answer",
          provider: "openai",
          model: "gpt-4o-mini",
          status: "success",
          finish_reason: "stop",
          input_tokens: 120,
          output_tokens: 48,
          reasoning_tokens: 12,
          cached_tokens: null,
          ttft_ms: 320,
          duration_ms: 1500,
          error_message: null,
          prompt_snapshot: {
            raw_preview: "prompt preview",
            char_count: 14,
            sha256: "promptsha",
            redaction_applied: false,
            truncated: false,
          },
          response_snapshot: {
            raw_preview: "response preview",
            char_count: 16,
            sha256: "responsesha",
            redaction_applied: false,
            truncated: false,
          },
          metadata: {},
          started_at: "2026-04-02T10:00:00+00:00",
          finished_at: "2026-04-02T10:00:01+00:00",
        },
      ],
      tool_calls: [
        {
          id: "tool-1",
          run_id: "run-1",
          trace_id: "trace-1",
          tool_name: "search_notebook_knowledge",
          status: "success",
          cache_hit: false,
          result_count: 3,
          followup_tool_hint: null,
          duration_ms: 800,
          error_message: null,
          input_snapshot: {
            raw_preview: "tool input",
            char_count: 10,
            sha256: "inputsha",
            redaction_applied: false,
            truncated: false,
          },
          output_snapshot: {
            raw_preview: "tool output",
            char_count: 11,
            sha256: "outputsha",
            redaction_applied: false,
            truncated: false,
          },
          metadata: {},
          started_at: "2026-04-02T10:00:00+00:00",
          finished_at: "2026-04-02T10:00:01+00:00",
        },
      ],
      summary: {
        total_duration_ms: 2300,
        total_llm_calls: 1,
        total_tool_calls: 1,
        total_input_tokens: 120,
        total_output_tokens: 48,
        final_status: "done",
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("用户问题")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Input").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Output").length).toBeGreaterThan(0);
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("chat.llm.stream")).toBeInTheDocument();
    expect(screen.getByText("Span 1")).toBeInTheDocument();
    expect(screen.getByText("用户问题")).toBeInTheDocument();
    expect(screen.getByText("最终回答")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /llm calls/i }));
    expect(screen.getByText("stream_answer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /tools/i }));
    expect(screen.getByText("search_notebook_knowledge")).toBeInTheDocument();
  });
});
