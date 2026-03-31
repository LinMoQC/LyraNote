import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotebookWorkspace } from "@/features/notebook/notebook-workspace";

let mobileMatches = true;
const setMobileHeaderMode = vi.fn();
const invalidateQueries = vi.fn();
const setActiveSourceId = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.text ? `${key}:${values.text}` : key,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: [], isLoading: false })),
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => ({ matches: mobileMatches, ready: true }),
}));

vi.mock("@/features/notebook/notebook-header", () => ({
  NotebookTopBar: ({
    isMobile,
    onMobileSheetChange,
  }: {
    isMobile?: boolean;
    onMobileSheetChange?: (sheet: "none" | "sources" | "copilot" | "toc") => void;
  }) => (
    <div data-testid={`notebook-topbar-${isMobile ? "mobile" : "desktop"}`}>
      <button data-testid="toggle-sources" onClick={() => onMobileSheetChange?.("sources")} type="button">
        sources
      </button>
      <button data-testid="toggle-copilot" onClick={() => onMobileSheetChange?.("copilot")} type="button">
        copilot
      </button>
      <button data-testid="toggle-toc" onClick={() => onMobileSheetChange?.("toc")} type="button">
        toc
      </button>
      <button data-testid="toggle-none" onClick={() => onMobileSheetChange?.("none")} type="button">
        none
      </button>
    </div>
  ),
}));

vi.mock("@/features/notebook/mobile-workspace-sheet", () => ({
  MobileWorkspaceSheet: ({
    activeSheet,
    children,
  }: {
    activeSheet: string;
    children?: ReactNode;
  }) => (
    <div data-testid="mobile-workspace-sheet" data-active-sheet={activeSheet}>
      {children}
    </div>
  ),
}));

vi.mock("@/features/editor/note-editor", () => ({
  NoteEditor: ({ isMobileLayout }: { isMobileLayout?: boolean }) => (
    <div data-testid={`note-editor-${isMobileLayout ? "mobile" : "desktop"}`}>editor</div>
  ),
}));

vi.mock("@/features/source/sources-panel", () => ({
  SourcesPanel: ({ variant }: { variant?: string }) => (
    <div data-testid={`sources-panel-${variant ?? "sidebar"}`}>sources</div>
  ),
}));

vi.mock("@/features/notebook/notebook-toc", () => ({
  NotebookTOC: ({ variant }: { variant?: string }) => (
    <div data-testid={`notebook-toc-${variant ?? "sidebar"}`}>toc</div>
  ),
}));

vi.mock("@/features/copilot/copilot-panel", () => ({
  DEFAULT_WIDTH: 400,
  CopilotPanel: ({
    presentation = "fixed",
    isOpen,
  }: {
    presentation?: "fixed" | "sheet";
    isOpen: boolean;
  }) => (
    <div data-testid={`copilot-panel-${presentation}`} data-open={String(isOpen)}>
      copilot
    </div>
  ),
}));

vi.mock("@/features/copilot/floating-orb", () => ({
  FloatingOrb: () => <div data-testid="floating-orb">orb</div>,
}));

vi.mock("@/features/notebook/floating-toc", () => ({
  FloatingTOC: () => <div data-testid="floating-toc">floating toc</div>,
}));

vi.mock("@/features/source/import-source-dialog", () => ({
  ImportSourceDialog: () => null,
}));

vi.mock("@/features/source/source-detail-drawer", () => ({
  SourceDetailDrawer: ({ presentation }: { presentation?: string }) => (
    <div data-testid={`source-detail-drawer-${presentation ?? "side"}`}>drawer</div>
  ),
}));

vi.mock("@/store/use-ui-store", () => ({
  useUiStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    setImportDialogOpen: vi.fn(),
    setMobileHeaderMode,
  }),
}));

vi.mock("@/store/use-notebook-store", () => ({
  useNotebookStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    activeSourceId: null,
    setActiveSourceId,
  }),
}));

vi.mock("@/store/use-proactive-store", () => ({
  useProactiveStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    setWritingContext: vi.fn(),
  }),
}));

vi.mock("@/services/note-service", () => ({
  listNotes: vi.fn(async () => [{ id: "note-1", title: "First note" }]),
}));

vi.mock("@/services/source-service", () => ({
  getSources: vi.fn(async () => []),
}));

vi.mock("@/services/ai-service", () => ({
  getWritingContext: vi.fn(async () => []),
}));

vi.mock("@/hooks/use-markdown-worker", () => ({
  useMarkdownWorker: () => async (content: string) => content,
}));

describe("NotebookWorkspace", () => {
  beforeEach(() => {
    mobileMatches = true;
    setMobileHeaderMode.mockReset();
    invalidateQueries.mockReset();
    setActiveSourceId.mockReset();
    localStorage.clear();
    global.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver;
  });

  it("uses a single active mobile sheet and hides the global mobile header", async () => {
    render(
      <NotebookWorkspace
        notebookId="nb-1"
        title="Notebook"
        initialMessages={[]}
      />
    );

    expect(screen.getByTestId("notebook-topbar-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("note-editor-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-workspace-sheet")).toHaveAttribute("data-active-sheet", "none");

    fireEvent.click(screen.getByTestId("toggle-sources"));
    expect(screen.getByTestId("mobile-workspace-sheet")).toHaveAttribute("data-active-sheet", "sources");

    fireEvent.click(screen.getByTestId("toggle-copilot"));
    expect(screen.getByTestId("mobile-workspace-sheet")).toHaveAttribute("data-active-sheet", "copilot");

    fireEvent.click(screen.getByTestId("toggle-toc"));
    expect(screen.getByTestId("mobile-workspace-sheet")).toHaveAttribute("data-active-sheet", "toc");

    await waitFor(() => {
      expect(setMobileHeaderMode).toHaveBeenCalledWith("hidden");
    });
  });

  it("closes desktop copilot when switching to mobile", async () => {
    localStorage.setItem("lyra:copilot-open", "true");
    mobileMatches = false;

    const { rerender } = render(
      <NotebookWorkspace
        notebookId="nb-1"
        title="Notebook"
        initialMessages={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("copilot-panel-fixed")).toHaveAttribute("data-open", "true");
    });

    mobileMatches = true;
    rerender(
      <NotebookWorkspace
        notebookId="nb-1"
        title="Notebook"
        initialMessages={[]}
      />
    );

    await waitFor(() => {
      expect(screen.queryByTestId("copilot-panel-fixed")).not.toBeInTheDocument();
      expect(screen.getByTestId("mobile-workspace-sheet")).toHaveAttribute("data-active-sheet", "none");
    });
  });
});
