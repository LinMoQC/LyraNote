import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotebookLoading from "@/app/(workspace)/app/notebooks/[id]/loading";

describe("NotebookLoading", () => {
  it("shows a floating orb instead of an opened copilot panel", () => {
    const { container } = render(<NotebookLoading />);

    expect(screen.getByTestId("notebook-loading-orb")).toBeInTheDocument();
    expect(container.querySelector("[style*='width: 440px']")).not.toBeInTheDocument();
  });
});
