import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FailuresPage } from "@/features/failures/failures-page";
import { getFailures } from "@/services/monitoring-service";

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
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/failures",
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
    getFailures: vi.fn(),
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
      <FailuresPage />
    </QueryClientProvider>,
  );
}

describe("FailuresPage", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams("window=24h");
    vi.mocked(getFailures).mockReset();
  });

  it("renders trace links and missing-trace badges", async () => {
    vi.mocked(getFailures).mockResolvedValue({
      items: [
        {
          kind: "chat_generation",
          id: "gen-1",
          status: "failed",
          message: "stream failed",
          trace_id: "trace-1",
          trace_available: true,
          trace_missing_reason: null,
          created_at: "2026-04-24T10:00:00+00:00",
        },
        {
          kind: "source_ingest",
          id: "src-1",
          status: "failed",
          message: "source failed",
          trace_id: null,
          trace_available: false,
          trace_missing_reason: "legacy_source_ingest_without_trace",
          notebook_id: "nb-1",
          created_at: "2026-04-24T11:00:00+00:00",
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("查看 Trace")).toBeInTheDocument();
    });

    expect(getFailures).toHaveBeenCalledWith({
      window: "24h",
      kind: undefined,
      user_id: undefined,
      conversation_id: undefined,
      generation_id: undefined,
      task_id: undefined,
      task_run_id: undefined,
      notebook_id: undefined,
    });
    expect(screen.getByText("历史无 Trace")).toBeInTheDocument();
  });
});
