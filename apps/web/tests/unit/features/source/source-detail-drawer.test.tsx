import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SourceDetailDrawer } from "@/features/source/source-detail-drawer";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values?.count != null ? `${key}:${values.count}` : key,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
    aside: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <aside {...props}>{children}</aside>
    ),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(({ enabled }: { enabled?: boolean }) => ({
    data: enabled ? [] : [],
    isLoading: false,
  })),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/services/notebook-service", () => ({
  getNotebooks: vi.fn(async () => []),
}));

vi.mock("@/services/source-service", () => ({
  deleteSource: vi.fn(),
  getChunks: vi.fn(async () => []),
  rechunkSource: vi.fn(),
  updateSource: vi.fn(),
}));

describe("SourceDetailDrawer", () => {
  it("renders the mobile modal presentation", () => {
    render(
      <SourceDetailDrawer
        source={{
          id: "source-1",
          title: "Source title",
          type: "pdf",
          status: "indexed",
          summary: "summary",
          notebookId: "nb-1",
        } as never}
        onClose={vi.fn()}
        presentation="modal"
      />
    );

    expect(screen.getByTestId("source-detail-drawer-modal")).toBeInTheDocument();
    expect(screen.getByText("Source title")).toBeInTheDocument();
  });
});
