import { screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { NoteEditor } from "@/features/editor/note-editor";
import { renderWithProviders } from "@test/utils/render-with-providers";

const editorMock = {
  commands: {
    setContent: vi.fn(),
    clearGhostSuggestion: vi.fn(),
    setGhostSuggestion: vi.fn(),
  },
  storage: {
    characterCount: {
      characters: vi.fn(() => 0),
    },
  },
  state: {
    selection: { from: 0 },
    doc: {
      textBetween: vi.fn(() => ""),
    },
  },
  view: {
    coordsAtPos: vi.fn(() => ({ top: 0, left: 0 })),
    dom: {
      getBoundingClientRect: vi.fn(() => ({ top: 0, left: 0, width: 800 })),
    },
  },
  on: vi.fn(),
  off: vi.fn(),
  getJSON: vi.fn(() => ({ type: "doc", content: [] })),
  getText: vi.fn(() => ""),
};

vi.mock("@tiptap/react", () => ({
  EditorContent: () => <div data-testid="editor-content" />,
  useEditor: () => editorMock,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  m: {
    div: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/features/editor/selection-action-menu", () => ({
  SelectionActionMenu: () => <div data-testid="selection-action-menu" />,
}));

vi.mock("@/features/editor/block-handle", () => ({
  BlockHandle: () => <div data-testid="block-handle" />,
}));

vi.mock("@/lib/tiptap", () => ({
  tiptapExtensions: [],
}));

vi.mock("@/services/ai-service", () => ({
  getInlineSuggestion: vi.fn(async () => ""),
}));

vi.mock("@/services/note-service", () => ({
  getNote: vi.fn(async () => null),
  getNoteForNotebook: vi.fn(async () => ({
    id: "note-1",
    title: "《三年风雪，青山不摇：从字节折戟到快手破局的前端求职复盘》",
    contentJson: { type: "doc", content: [{ type: "paragraph" }] },
    updatedAt: "2026-04-10T00:00:00.000Z",
  })),
  saveNote: vi.fn(async () => ({
    id: "note-1",
    title: "saved",
    contentJson: { type: "doc", content: [{ type: "paragraph" }] },
    updatedAt: "2026-04-10T00:00:00.000Z",
  })),
}));

describe("NoteEditor", () => {
  it("renders a wrapping title textarea with smaller fixed sizing and larger top spacing", async () => {
    renderWithProviders(<NoteEditor notebookId="notebook-1" />, {
      messages: {
        editor: {
          titlePlaceholder: "笔记标题",
          untitled: "未命名",
          needHelp: "Need help",
          continueWriting: "Continue writing",
          searchMaterial: "Search material",
        },
        notebook: {},
      },
    });

    const titleField = await screen.findByTestId("note-title-field");
    await waitFor(() => {
      expect(titleField).toHaveValue("《三年风雪，青山不摇：从字节折戟到快手破局的前端求职复盘》");
    });

    expect(titleField.tagName).toBe("TEXTAREA");
    expect(titleField).toHaveStyle({ fontSize: "var(--editor-title-size, 2.5rem)" });
    expect(titleField).toHaveAttribute("rows", "1");
    expect(screen.getByTestId("note-editor-content-shell").className).toContain("pt-20");
    expect(titleField.className).toContain("mb-6");
  });
});
