import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotebooksLoading from "@/app/(workspace)/app/notebooks/loading";

describe("NotebooksLoading", () => {
  it("matches the notebooks desktop grid layout without a create placeholder", () => {
    const { container } = render(<NotebooksLoading />);

    const grid = screen.getByTestId("notebooks-loading-grid");
    expect(grid.className).toContain("xl:grid-cols-5");
    expect(grid.className).toContain("lg:grid-cols-4");

    const cards = container.querySelectorAll("[data-testid='notebooks-loading-grid'] > div");
    expect(cards).toHaveLength(6);
  });
});
