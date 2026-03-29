import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HomeSuggestions } from "@/components/home/home-suggestions";
import { getSuggestions } from "@/services/ai-service";
import { renderWithProviders } from "@test/utils/render-with-providers";

vi.mock("framer-motion", () => ({
  m: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("@/services/ai-service", () => ({
  getSuggestions: vi.fn(),
}));

const mockedGetSuggestions = vi.mocked(getSuggestions);

describe("HomeSuggestions", () => {
  it("renders hero loading as marquee-style pills", () => {
    mockedGetSuggestions.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<HomeSuggestions onSelect={vi.fn()} variant="hero" />);

    expect(screen.getByTestId("home-suggestions-hero-loading")).toBeInTheDocument();
    expect(screen.getByTestId("home-suggestions-hero-loading").className).toContain("flex");
  });

  it("renders fetched suggestions and forwards selection", async () => {
    const onSelect = vi.fn();
    mockedGetSuggestions.mockResolvedValue(["Ask Lyra about agents"]);

    renderWithProviders(<HomeSuggestions onSelect={onSelect} />);

    const suggestion = await screen.findByRole("button", { name: /Ask Lyra about agents/i });
    await userEvent.click(suggestion);

    expect(onSelect).toHaveBeenCalledWith("Ask Lyra about agents");
  });
});
