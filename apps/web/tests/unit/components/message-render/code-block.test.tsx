import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CodeBlock } from "@lyranote/ui/message-render";
import { renderWithProviders } from "@test/utils/render-with-providers";

describe("CodeBlock", () => {
  it("renders syntax-highlighted code with a normalized language label", () => {
    const { container } = renderWithProviders(
      <CodeBlock code={["const answer = 42", "console.log(answer)"].join("\n")} language="language-ts" />
    );

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(container.querySelector('[data-highlighted="true"]')).toBeInTheDocument();
    expect(container.querySelectorAll("pre code span[data-code-token]").length).toBeGreaterThan(0);
  });

  it("keeps plain-text fences unhighlighted", () => {
    const { container } = renderWithProviders(<CodeBlock code="just some plain text" language="language-text" />);

    expect(screen.getByText("Plain text")).toBeInTheDocument();
    expect(container.querySelector('[data-highlighted="false"]')).toBeInTheDocument();
    expect(container.querySelector("pre code span[data-code-token]")).not.toBeInTheDocument();
  });
});
