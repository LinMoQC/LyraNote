import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { DeepResearchSaveNoteDialog } from "@/components/deep-research/dr-save-note-dialog";
import { createTestQueryClient } from "@test/utils/create-test-query-client";

const {
  createNotebookMock,
  getNotebooksMock,
  notifyErrorMock,
} = vi.hoisted(() => ({
  createNotebookMock: vi.fn(),
  getNotebooksMock: vi.fn(),
  notifyErrorMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "sourcesShort") return `${values?.count} sources`;
    if (key === "saveTargetDesc") return `saveTargetDesc:${values?.title}`;
    return key;
  },
}));

vi.mock("@/services/notebook-service", () => ({
  createNotebook: createNotebookMock,
  getNotebooks: getNotebooksMock,
}));

vi.mock("@/lib/notify", () => ({
  notifyError: notifyErrorMock,
}));

function createWrapper() {
  const queryClient = createTestQueryClient();

  return function Wrapper({ children }: Pick<ComponentProps<typeof QueryClientProvider>, "children">) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("DeepResearchSaveNoteDialog", () => {
  it("lists notebooks and saves to the selected notebook", async () => {
    const onSelectNotebook = vi.fn(async () => {});
    getNotebooksMock.mockResolvedValue([
      {
        id: "notebook-1",
        title: "AI Research",
        description: "",
        updatedAt: "2026-04-25T00:00:00.000Z",
        sourceCount: 12,
        noteCount: 1,
        artifactCount: 0,
        wordCount: 0,
        status: "ready",
      },
    ]);

    render(
      <DeepResearchSaveNoteDialog
        open
        reportTitle="深度研究报告"
        onClose={vi.fn()}
        onSelectNotebook={onSelectNotebook}
      />,
      { wrapper: createWrapper() },
    );

    expect(await screen.findByText("AI Research")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /saveToNotebook/i }));

    await waitFor(() => {
      expect(onSelectNotebook).toHaveBeenCalledWith("notebook-1");
    });
  });
});
