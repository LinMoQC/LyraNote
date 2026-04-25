import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SelectionActionMenu } from "@/features/editor/selection-action-menu";
import { renderWithProviders } from "@test/utils/render-with-providers";

const runRewrite = vi.fn();
const acceptEdit = vi.fn();
const rejectEdit = vi.fn();
const retry = vi.fn();
const rewriteState = {
  isRewriting: false,
  appliedEdit: null as null | {
    action: "proofread";
    from: number;
    to: number;
    originalText: string;
    result: string;
  },
};

vi.mock("@tiptap/react", () => ({
  BubbleMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-inline-rewrite", () => ({
  useInlineRewrite: () => ({
    isRewriting: rewriteState.isRewriting,
    appliedEdit: rewriteState.appliedEdit,
    runRewrite,
    acceptEdit,
    rejectEdit,
    retry,
    lastAction: rewriteState.appliedEdit?.action ?? null,
  }),
}));

function createEditorMock() {
  const chain = {
    focus: vi.fn(() => chain),
    setParagraph: vi.fn(() => chain),
    toggleHighlight: vi.fn(() => chain),
    toggleBold: vi.fn(() => chain),
    toggleItalic: vi.fn(() => chain),
    toggleUnderline: vi.fn(() => chain),
    extendMarkRange: vi.fn(() => chain),
    unsetLink: vi.fn(() => chain),
    setLink: vi.fn(() => chain),
    toggleStrike: vi.fn(() => chain),
    toggleCode: vi.fn(() => chain),
    unsetAllMarks: vi.fn(() => chain),
    run: vi.fn(),
  };

  return {
    state: {
      selection: { from: 3, to: 18 },
      doc: {
        content: { size: 200 },
        textBetween: vi.fn(() => "Selected text"),
        nodeAt: vi.fn(() => ({ type: { name: "paragraph" } })),
      },
    },
    view: {
      coordsAtPos: vi.fn(() => ({ left: 120, bottom: 240 })),
    },
    isEditable: true,
    getAttributes: vi.fn(() => ({})),
    getText: vi.fn(() => "Selected text"),
    isActive: vi.fn(() => false),
    chain: vi.fn(() => chain),
  };
}

const messages = {
  editor: {
    blockTypeText: "Text",
    selectionHighlight: "Highlight",
    selectionBold: "Bold",
    selectionItalic: "Italic",
    selectionUnderline: "Underline",
    selectionLink: "Link",
    selectionStrike: "Strikethrough",
    selectionCode: "Code",
    selectionFormula: "Formula",
    more: "More",
    selectionClearMarks: "Clear formatting",
    selectionComment: "Comment",
    selectionEditSuggestion: "Edit suggestion",
    selectionFeedback: "Feedback",
    selectionSkillLabel: "Skills",
    selectionSkillSettings: "Settings",
    selectionAiInputPlaceholder: "Use AI to edit",
    selectionAiSubmit: "Send",
    selectionAiShortcut: "Shortcut",
    selectionPreviewTitle: "{action} result",
    selectionApply: "Replace text",
    selectionRetry: "Retry",
    selectionCancel: "Cancel",
    selectionSkill: {
      polish: "Improve writing",
      proofread: "Proofread",
      reformat: "Reformat",
      shorten: "Condense",
      explain: "Explain",
    },
    linkPlaceholder: "Link",
  },
} satisfies Record<string, unknown>;

describe("SelectionActionMenu", () => {
  beforeEach(() => {
    runRewrite.mockReset();
    acceptEdit.mockReset();
    rejectEdit.mockReset();
    retry.mockReset();
    rewriteState.isRewriting = false;
    rewriteState.appliedEdit = null;
  });

  it("renders grouped actions and routes inline rewrite skills", () => {
    renderWithProviders(
      <SelectionActionMenu editor={createEditorMock() as never} onEditorAction={vi.fn()} />,
      { messages },
    );

    expect(screen.getByTestId("selection-action-menu")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("selection-ai-skill-proofread"));
    expect(runRewrite).toHaveBeenCalledWith("proofread");

    const moreButton = screen.getByRole("button", { name: "More" });
    fireEvent.click(moreButton);
    expect(moreButton).toBeInTheDocument();
  });

  it("submits custom AI edit as a structured editor action", () => {
    const onEditorAction = vi.fn();

    renderWithProviders(
      <SelectionActionMenu editor={createEditorMock() as never} onEditorAction={onEditorAction} />,
      { messages },
    );

    fireEvent.change(screen.getByTestId("selection-ai-input"), {
      target: { value: "Make it more concise" },
    });
    fireEvent.keyDown(screen.getByTestId("selection-ai-input"), {
      key: "Enter",
      code: "Enter",
    });

    expect(onEditorAction).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "selection",
        action: "customEdit",
        text: "Selected text",
        intent: "Make it more concise",
      }),
    );
  });

  it("shows the local preview card and applies the rewrite", () => {
    rewriteState.appliedEdit = {
      action: "proofread",
      from: 3,
      to: 18,
      originalText: "Selected text",
      result: "Fixed text",
    };

    renderWithProviders(
      <SelectionActionMenu editor={createEditorMock() as never} onEditorAction={vi.fn()} />,
      { messages },
    );

    fireEvent.click(screen.getByTestId("selection-ai-skill-proofread"));
    expect(screen.getByRole("button", { name: "Replace text" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace text" }));
    expect(acceptEdit).toHaveBeenCalled();
  });
});
