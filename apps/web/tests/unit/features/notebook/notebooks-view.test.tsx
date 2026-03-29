import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { NotebooksView } from "@/features/notebook/notebooks-view";
import { buildNotebook } from "@test/fixtures/notebook.factory";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("framer-motion", () => ({
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@/services/notebook-service", () => ({
  createNotebook: vi.fn(),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: vi.fn(),
}));

vi.mock("@/features/notebook/notebook-card", () => ({
  NotebookCard: ({ notebook }: { notebook: { title: string } }) => (
    <div data-testid="notebook-card">{notebook.title}</div>
  ),
  NotebookListRow: ({ notebook }: { notebook: { title: string } }) => (
    <div data-testid="notebook-list-row">{notebook.title}</div>
  ),
}));

const { useMediaQuery } = await import("@/hooks/use-media-query");
const mockedUseMediaQuery = vi.mocked(useMediaQuery);

describe("NotebooksView", () => {
  it("uses a single-column-first grid layout on desktop", () => {
    mockedUseMediaQuery.mockReturnValue({ matches: false, ready: true });

    render(<NotebooksView notebooks={[buildNotebook({ id: "1", title: "Alpha" })]} />);

    const grid = screen.getByTestId("notebooks-grid");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("sm:grid-cols-2");
    expect(screen.getByRole("heading", { name: "myNotebooks" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "new" }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("new-notebook-card")).not.toBeInTheDocument();
  });

  it("can switch to list mode", () => {
    mockedUseMediaQuery.mockReturnValue({ matches: false, ready: true });

    render(
      <NotebooksView
        notebooks={[
          buildNotebook({ id: "1", title: "Alpha" }),
          buildNotebook({ id: "2", title: "Beta" }),
        ]}
      />
    );

    fireEvent.click(screen.getAllByTestId("notebooks-list-toggle")[0]);

    expect(screen.getByTestId("notebooks-list")).toBeInTheDocument();
    expect(screen.queryByTestId("notebooks-grid")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("notebook-list-row")).toHaveLength(2);
  });

  it("uses compact list layout on mobile", () => {
    mockedUseMediaQuery.mockReturnValue({ matches: true, ready: true });

    render(
      <NotebooksView
        notebooks={[
          buildNotebook({ id: "1", title: "Alpha" }),
          buildNotebook({ id: "2", title: "Beta" }),
        ]}
      />
    );

    expect(screen.getByTestId("notebooks-list")).toBeInTheDocument();
    expect(screen.queryByTestId("notebooks-grid")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("notebook-list-row")).toHaveLength(2);
  });
});
