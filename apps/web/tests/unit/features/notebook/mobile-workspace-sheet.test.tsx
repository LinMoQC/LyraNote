import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { MobileWorkspaceSheet } from "@/features/notebook/mobile-workspace-sheet";

vi.mock("framer-motion", () => ({
  m: {
    div: ({
      children,
      initial,
      animate,
      transition,
      drag,
      dragControls,
      dragListener,
      dragElastic,
      dragConstraints,
      onDragEnd,
      ...props
    }: {
      children?: ReactNode;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
  },
  useDragControls: () => ({
    start: vi.fn(),
  }),
}));

describe("MobileWorkspaceSheet", () => {
  it("keeps the copilot height while closing so it does not jump taller first", () => {
    const { rerender } = render(
      <MobileWorkspaceSheet
        activeSheet="copilot"
        copilotSnap="half"
        onClose={vi.fn()}
        onSnapChange={vi.fn()}
      >
        <div>sheet</div>
      </MobileWorkspaceSheet>,
    );

    expect(screen.getByTestId("mobile-workspace-sheet-root")).toHaveStyle({ height: "56vh" });

    rerender(
      <MobileWorkspaceSheet
        activeSheet="none"
        copilotSnap="half"
        onClose={vi.fn()}
        onSnapChange={vi.fn()}
      >
        <div>sheet</div>
      </MobileWorkspaceSheet>,
    );

    expect(screen.getByTestId("mobile-workspace-sheet-root")).toHaveStyle({ height: "56vh" });
  });
});
