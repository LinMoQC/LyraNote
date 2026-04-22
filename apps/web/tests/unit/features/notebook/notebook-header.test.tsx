import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { NotebookTopBar } from "@/features/notebook/notebook-header";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: (value: Date) => value.toISOString(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@/services/notebook-service", () => ({
  deleteNotebook: vi.fn(),
  renameNotebook: vi.fn(),
}));

vi.mock("@/features/notebook/note-picker-dropdown", () => ({
  NotePickerDropdown: ({ variant }: { variant?: string }) => (
    <div data-testid={`note-picker-${variant ?? "breadcrumb"}`}>picker</div>
  ),
}));

describe("NotebookTopBar", () => {
  it("renders the two-row mobile header and toggles sheet triggers", () => {
    const onMobileSheetChange = vi.fn();

    render(
      <NotebookTopBar
        notebookId="nb-1"
        title="A very long notebook title"
        saveStatus="saved"
        activeNoteId="note-1"
        activeNoteTitle="My note"
        onNoteSelect={vi.fn()}
        onNoteCreated={vi.fn()}
        onNoteDeleted={vi.fn()}
        isMobile
        mobileActiveSheet="none"
        onMobileSheetChange={onMobileSheetChange}
      />
    );

    expect(screen.getByText("A very long notebook title")).toBeInTheDocument();
    expect(screen.getByTestId("note-picker-compact")).toBeInTheDocument();
    expect(screen.queryByText("My note")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mobile-sheet-trigger-toc"));
    expect(onMobileSheetChange).toHaveBeenCalledWith("toc");

    fireEvent.click(screen.getByTestId("mobile-sheet-trigger-sources"));
    expect(onMobileSheetChange).toHaveBeenCalledWith("sources");

    fireEvent.click(screen.getByTestId("mobile-sheet-trigger-copilot"));
    expect(onMobileSheetChange).toHaveBeenCalledWith("copilot");
  });
});
