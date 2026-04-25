import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProactiveToaster } from "@/features/copilot/proactive-toaster";
import { useProactiveStore } from "@/store/use-proactive-store";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe("ProactiveToaster", () => {
  beforeEach(() => {
    useProactiveStore.setState({
      suggestions: [],
      writingContext: [],
      unreadCount: 0,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders only the surfaced suggestion and keeps inbox-only items hidden", () => {
    useProactiveStore.getState().addSuggestion({
      type: "insight",
      origin: "proactive_insight",
      delivery: "inbox",
      fingerprint: "insight:inbox-only",
      message: "Inbox only insight",
    });
    useProactiveStore.getState().addSuggestion({
      type: "source_indexed",
      origin: "source_indexed",
      delivery: "surface",
      fingerprint: "source:surface",
      sourceName: "Paper A",
      summary: "Surface summary",
    });

    render(<ProactiveToaster onAsk={vi.fn()} />);

    expect(screen.getByText("sourceIndexed:Paper A")).toBeInTheDocument();
    expect(screen.queryByText("Inbox only insight")).not.toBeInTheDocument();
  });

  it("auto-hides surfaced cards after ten seconds without marking them read", () => {
    const suggestionId = useProactiveStore.getState().addSuggestion({
      type: "insight",
      origin: "lyra_thought",
      delivery: "surface",
      fingerprint: "thought:auto-hide",
      message: "A surfaced thought",
    });

    render(<ProactiveToaster onAsk={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    const suggestion = useProactiveStore.getState().suggestions.find((item) => item.id === suggestionId);
    expect(suggestion?.hiddenAt).toBeTypeOf("number");
    expect(suggestion?.read).toBe(false);
  });

  it("marks the surfaced card as read when the user closes it", () => {
    const suggestionId = useProactiveStore.getState().addSuggestion({
      type: "insight",
      origin: "lyra_thought",
      delivery: "surface",
      fingerprint: "thought:dismiss",
      message: "Dismiss me",
    });

    render(<ProactiveToaster onAsk={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "close" }));

    const suggestion = useProactiveStore.getState().suggestions.find((item) => item.id === suggestionId);
    expect(suggestion?.read).toBe(true);
    expect(suggestion?.hiddenAt).toBeTypeOf("number");
  });
});
