import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DrDocumentViewer } from "@/components/deep-research/dr-document-viewer";
import type { DrProgress } from "@/components/deep-research/dr-types";

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

vi.mock("@lyranote/ui/genui", () => ({
  buildMarkdownComponents: () => ({}),
}));

function makeProgress(): DrProgress {
  return {
    status: "done",
    mode: "quick",
    subQuestions: [],
    learnings: [],
    reportTokens: "# Report\n\nbody",
    doneCitations: [],
    deliverable: {
      title: "Research Report",
      summary: "summary",
      citationCount: 3,
      nextQuestions: [],
      evidenceStrength: "medium",
      citationTable: [],
    },
  };
}

describe("DrDocumentViewer", () => {
  it("uses the pointer cursor on the save button and preserves the disabled cursor state", () => {
    render(
      <DrDocumentViewer
        open
        progress={makeProgress()}
        onClose={vi.fn()}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "saveAsNote" });

    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveClass("cursor-pointer");
    expect(saveButton).toHaveClass("disabled:cursor-not-allowed");
  });
});
