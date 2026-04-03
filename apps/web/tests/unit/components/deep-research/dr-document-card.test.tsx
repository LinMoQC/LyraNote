import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DrDocumentCard } from "@/components/deep-research/dr-document-card";
import type { DrProgress } from "@/components/deep-research/dr-types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "sourceCount") return `${values?.count} sources`;
    return key;
  },
}));

vi.mock("framer-motion", () => ({
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

function makeProgress(): DrProgress {
  return {
    status: "done",
    mode: "quick",
    subQuestions: [],
    learnings: [],
    reportTokens: "report body",
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

describe("DrDocumentCard", () => {
  it("renders a save-sources action when provided", () => {
    const onSaveSources = vi.fn();

    render(
      <DrDocumentCard
        progress={makeProgress()}
        onOpen={vi.fn()}
        onSaveSources={onSaveSources}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("saveSources"));

    expect(onSaveSources).toHaveBeenCalledTimes(1);
  });
});
