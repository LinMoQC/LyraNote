import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CitationFooter } from "@lyranote/ui/message-render";
import type { CitationData } from "@/types";
import { renderWithProviders } from "@test/utils/render-with-providers";

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

    renderWithProviders(<CitationFooter citations={citations} namespace="chat" />, {
      messages: {
        chat: {
          citationSources: "Sources {count}",
        },
      },
    });

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
