import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SourcesPanel } from "@/features/source/sources-panel";

const mockSources = [
  {
    id: "failed-older",
    notebookId: "nb-1",
    title: "Paper",
    type: "pdf",
    status: "failed",
    summary: "Old failure",
    updatedAt: "2026-04-03T10:00:00Z",
  },
  {
    id: "indexed-latest",
    notebookId: "nb-1",
    title: "Paper",
    type: "pdf",
    status: "indexed",
    summary: "Summary",
    updatedAt: "2026-04-03T11:00:00Z",
  },
];

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values?.count != null ? `${key}:${values.count}` : key,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({
    data: mockSources,
    isLoading: false,
  })),
}));

vi.mock("@/store/use-ui-store", () => ({
  useUiStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    setImportDialogOpen: vi.fn(),
  }),
}));

vi.mock("@/store/use-notebook-store", () => ({
  useNotebookStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    activeSourceId: null,
    setActiveSourceId: vi.fn(),
  }),
}));

vi.mock("@/store/use-proactive-store", () => ({
  useProactiveStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    addSuggestion: vi.fn(),
  }),
}));

vi.mock("@/services/ai-service", () => ({
  getSourceSuggestions: vi.fn(async () => ({ questions: [], summary: "" })),
}));

vi.mock("@/services/source-service", () => ({
  getSources: vi.fn(async () => []),
}));

vi.mock("@/components/ui/loader", () => ({
  Loader: () => <div>loading</div>,
}));

describe("SourcesPanel", () => {
  it("renders the sheet variant without the desktop close button", () => {
    render(<SourcesPanel notebookId="nb-1" variant="sheet" onClose={vi.fn()} />);

    expect(screen.getByTestId("sources-panel-sheet")).toBeInTheDocument();
    expect(screen.queryByTitle("closePanelTitle")).not.toBeInTheDocument();
    expect(screen.getByText("Paper")).toBeInTheDocument();
    expect(screen.getByText("sourcesHeader:1")).toBeInTheDocument();
  });

  it("hides older duplicate records from failed/pending groups", () => {
    render(<SourcesPanel notebookId="nb-1" />);

    expect(screen.getByText("Paper")).toBeInTheDocument();
    expect(screen.queryByText("Old failure")).not.toBeInTheDocument();
    expect(screen.queryByText("importFailed")).not.toBeInTheDocument();
  });
});
