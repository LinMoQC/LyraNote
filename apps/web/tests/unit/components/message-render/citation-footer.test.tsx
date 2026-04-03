import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CitationFooter } from "@/components/message-render/citation-footer";
import type { CitationData } from "@/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    key === "citationSources" ? `Sources ${values?.count ?? 0}` : key,
}));

describe("CitationFooter", () => {
  it("renders duplicate citations without duplicate key warnings", async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const citations: CitationData[] = [
      {
        source_id: "web-search",
        chunk_id: "web-search-chunk-1",
        source_title: "Result A",
        excerpt: "First excerpt",
        score: 0.91,
      },
      {
        source_id: "web-search",
        chunk_id: "web-search-chunk-1",
        source_title: "Result A",
        excerpt: "Second excerpt",
        score: 0.82,
      },
    ];

    render(<CitationFooter citations={citations} namespace="chat" />);

    await user.click(screen.getByRole("button", { name: "Sources 2" }));

    expect(screen.getAllByText("Result A")).toHaveLength(2);
    expect(
      errorSpy.mock.calls.some((call) =>
        call.some(
          (arg) =>
            typeof arg === "string"
            && arg.includes("Encountered two children with the same key"),
        ),
      ),
    ).toBe(false);
  });
});
