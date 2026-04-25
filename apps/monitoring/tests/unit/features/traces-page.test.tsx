import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TracesPage } from "@/features/traces/traces-page";
import { getTraces } from "@/services/monitoring-service";

const push = vi.fn();
let searchParams = new URLSearchParams("window=24h");

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
  }),
  usePathname: () => "/traces",
  useSearchParams: () => searchParams,
}));

vi.mock("@/components/protected-view", () => ({
  ProtectedView: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/services/monitoring-service", async () => {
  const actual = await vi.importActual<typeof import("@/services/monitoring-service")>(
    "@/services/monitoring-service",
  );
  return {
    ...actual,
    getTraces: vi.fn(),
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
      <TracesPage />
    </QueryClientProvider>,
  );
}

describe("TracesPage", () => {
  beforeEach(() => {
    push.mockReset();
    searchParams = new URLSearchParams("window=24h");
    vi.mocked(getTraces).mockReset();
  });

  it("requests a smaller page size and shows the updated pagination copy", async () => {
    vi.mocked(getTraces).mockResolvedValue({
      items: [
        {
          id: "run-1",
          trace_id: "trace-1",
          run_type: "chat_generation",
          name: "chat.generation",
          status: "done",
          user_id: null,
          conversation_id: null,
          generation_id: null,
          task_id: null,
          task_run_id: null,
          notebook_id: null,
          duration_ms: 2300,
          error_message: null,
          metadata: {},
          started_at: "2026-04-02T10:00:00+00:00",
          finished_at: "2026-04-02T10:00:02+00:00",
        },
      ],
      total: 57,
      next_cursor: "cursor-2",
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("chat.generation")).toBeInTheDocument();
    });

    expect(getTraces).toHaveBeenCalledWith({
      window: "24h",
      type: undefined,
      status: undefined,
      cursor: undefined,
      limit: 12,
      user_id: undefined,
      conversation_id: undefined,
      generation_id: undefined,
      task_id: undefined,
      task_run_id: undefined,
      notebook_id: undefined,
    });
    expect(screen.getByText("第 1 / 5 页 · 每页 12 条 · 共 57 条")).toBeInTheDocument();
  });

  it("renders the empty state when no traces are returned", async () => {
    vi.mocked(getTraces).mockResolvedValue({
      items: [],
      total: 0,
      next_cursor: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("当前筛选条件下没有链路记录。")).toBeInTheDocument();
    });

    expect(screen.queryByText("第 1 / 1 页 · 每页 12 条 · 共 0 条")).not.toBeInTheDocument();
  });
});
