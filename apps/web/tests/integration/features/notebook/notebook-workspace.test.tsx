import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotebookWorkspace } from "@/features/notebook/notebook-workspace";

let mobileMatches = true;
const setMobileHeaderMode = vi.fn();
const invalidateQueries = vi.fn();
const setActiveSourceId = vi.fn();
let proactiveStoreState: Record<string, unknown>;

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.text ? `${key}:${values.text}` : values?.name ? `${key}:${values.name}` : key,
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
    button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <button {...props}>{children}</button>
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
  NoteEditor: ({
    isMobileLayout,
    onEditorAction,
  }: {
    isMobileLayout?: boolean;
    onEditorAction?: (payload: Record<string, unknown>) => void;
  }) => (
    <div data-testid={`note-editor-${isMobileLayout ? "mobile" : "desktop"}`}>
      editor
      <button
        data-testid={`trigger-editor-action-${isMobileLayout ? "mobile" : "desktop"}`}
        onClick={() => onEditorAction?.({
          scope: "selection",
          action: "customEdit",
          text: "Selected text",
          intent: "Make it tighter",
        })}
        type="button"
      >
        trigger
      </button>
    </div>
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
    pendingPrompt,
  }: {
    presentation?: "fixed" | "sheet";
    isOpen: boolean;
    pendingPrompt?: { text: string } | null;
  }) => (
    <div
      data-testid={`copilot-panel-${presentation}`}
      data-open={String(isOpen)}
      data-prompt={pendingPrompt?.text ?? ""}
    >
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
    setCopilotPanelOpen: vi.fn(),
  }),
}));

vi.mock("@/store/use-proactive-store", () => ({
  useProactiveStore: (selector: (state: Record<string, unknown>) => unknown) => selector(proactiveStoreState),
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
    proactiveStoreState = {
      suggestions: [],
      setWritingContext: vi.fn(),
      hideSuggestion: vi.fn(),
      dismissSuggestion: vi.fn(),
    };
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

  it("routes structured editor actions into the copilot prompt flow on desktop", async () => {
    mobileMatches = false;

    render(
      <NotebookWorkspace
        notebookId="nb-1"
        title="Notebook"
        initialMessages={[]}
      />
    );

    fireEvent.click(screen.getByTestId("trigger-editor-action-desktop"));

    await waitFor(() => {
      expect(screen.getByTestId("copilot-panel-fixed")).toHaveAttribute("data-open", "true");
      expect(screen.getByTestId("copilot-panel-fixed")).toHaveAttribute(
        "data-prompt",
        expect.stringContaining("customEditPrompt:Selected text"),
      );
    });
  });

  it("renders only surfaced proactive cards inside the workspace toaster", () => {
    proactiveStoreState = {
      ...proactiveStoreState,
      suggestions: [
        {
          id: "inbox-1",
          type: "insight",
          origin: "proactive_insight",
          delivery: "inbox",
          fingerprint: "insight:inbox",
          message: "Inbox only insight",
          createdAt: 1,
          read: false,
        },
        {
          id: "surface-1",
          type: "source_indexed",
          origin: "source_indexed",
          delivery: "surface",
          fingerprint: "source:1",
          sourceName: "Paper A",
          createdAt: 2,
          surfacedAt: 2,
          read: false,
        },
      ],
    };

    render(
      <NotebookWorkspace
        notebookId="nb-1"
        title="Notebook"
        initialMessages={[]}
      />
    );

    expect(screen.getByText("sourceIndexed:Paper A")).toBeInTheDocument();
    expect(screen.queryByText("Inbox only insight")).not.toBeInTheDocument();
  });
});
