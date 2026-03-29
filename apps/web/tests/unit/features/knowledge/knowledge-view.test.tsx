import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeView } from "@/features/knowledge/knowledge-view";

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useInfiniteQuery: () => ({
    data: {
      pages: [
        {
          items: [
            {
              id: "source-1",
              notebookId: "notebook-1",
              title: "AI Agent Research",
              summary: "summary",
              type: "web",
              status: "indexed",
            },
          ],
          total: 1,
          offset: 0,
          limit: 20,
          hasMore: false,
        },
      ],
    },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    isRefetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/source/import-source-dialog", () => ({
  ImportSourceDialog: () => null,
}));

vi.mock("@/features/source/source-detail-drawer", () => ({
  SourceDetailDrawer: () => null,
}));

vi.mock("@/features/knowledge/knowledge-graph-view", () => ({
  KnowledgeGraphView: () => <div data-testid="knowledge-graph-view">graph</div>,
}));

describe("KnowledgeView", () => {
  it("uses a mobile-friendly grid layout by default", () => {
    render(<KnowledgeView />);

    const grid = screen.getByTestId("knowledge-grid");
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("md:grid-cols-3");
    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
  });

  it("can switch to graph view", () => {
    render(<KnowledgeView />);

    fireEvent.click(screen.getByRole("button", { name: /graphView/i }));

    expect(screen.getByTestId("knowledge-graph-view")).toBeInTheDocument();
    expect(screen.queryByTestId("knowledge-grid")).not.toBeInTheDocument();
  });
});
