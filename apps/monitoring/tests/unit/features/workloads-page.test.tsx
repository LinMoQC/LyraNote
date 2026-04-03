import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkloadsPage } from "@/features/workloads/workloads-page";
import { getWorkloads } from "@/services/monitoring-service";

const push = vi.fn();
let searchParams = new URLSearchParams();

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
  usePathname: () => "/workloads",
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
    getWorkloads: vi.fn(),
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
      <WorkloadsPage />
    </QueryClientProvider>,
  );
}

describe("WorkloadsPage", () => {
  beforeEach(() => {
    push.mockReset();
    searchParams = new URLSearchParams();
    vi.mocked(getWorkloads).mockReset();
  });

  it("requests a smaller page size and renders pagination summary", async () => {
    vi.mocked(getWorkloads).mockResolvedValue({
      summary: [],
      items: [
        {
          kind: "chat_generation",
          id: "run-1",
          trace_id: "trace-1",
          status: "done",
          started_at: "2026-04-02T10:00:00+00:00",
          finished_at: "2026-04-02T10:00:10+00:00",
          conversation_id: null,
          task_id: null,
          task_run_id: null,
          title: "chat_generation",
          message: "运行中或已完成",
          stuck: false,
        },
      ],
      total: 24,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("第 1 / 2 页 · 每页 12 条 · 共 24 条")).toBeInTheDocument();
    });

    expect(getWorkloads).toHaveBeenCalledWith(undefined, undefined, 0, 12);
    expect(screen.getAllByText("chat_generation").length).toBeGreaterThan(0);
  });

  it("updates the page query param when navigating forward", async () => {
    const user = userEvent.setup();

    vi.mocked(getWorkloads).mockResolvedValue({
      summary: [],
      items: [
        {
          kind: "chat_generation",
          id: "run-1",
          trace_id: "trace-1",
          status: "done",
          started_at: "2026-04-02T10:00:00+00:00",
          finished_at: "2026-04-02T10:00:10+00:00",
          conversation_id: null,
          task_id: null,
          task_run_id: null,
          title: "chat_generation",
          message: "运行中或已完成",
          stuck: false,
        },
      ],
      total: 24,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /下一页/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /下一页/i }));
    expect(push).toHaveBeenCalledWith("/workloads?page=2");
  });
});
