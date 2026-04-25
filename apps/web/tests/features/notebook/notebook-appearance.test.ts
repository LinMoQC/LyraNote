import { describe, expect, it } from "vitest";

import { resolveNotebookAppearance } from "@/features/notebook/notebook-appearance";

describe("resolveNotebookAppearance", () => {
  it("maps each body font size preset to the expected title size", () => {
    expect(resolveNotebookAppearance({ fontSize: "sm" }).titleSizeValue).toBe("2.5rem");
    expect(resolveNotebookAppearance({ fontSize: "md" }).titleSizeValue).toBe("2.5rem");
    expect(resolveNotebookAppearance({ fontSize: "lg" }).titleSizeValue).toBe("2.5rem");
  });
});
