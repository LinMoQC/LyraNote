import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublicHomeSection } from "@/components/settings/sections/public-home-section";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join("-")}` : key,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({ setQueryData: vi.fn() })),
}));

vi.mock("@/lib/notify", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

const { useQuery, useMutation } = await import("@tanstack/react-query");
const mockedUseQuery = vi.mocked(useQuery);
const mockedUseMutation = vi.mocked(useMutation);

describe("PublicHomeSection", () => {
  it("shows draft and approved previews", () => {
    mockedUseQuery.mockReturnValue({
      data: {
        draftProfile: {
          heroSummary: "Draft profile",
          professionGuess: "Researcher",
          interestTags: ["AI"],
          currentResearch: ["Agents"],
        },
        approvedProfile: {
          heroSummary: "Approved profile",
          professionGuess: "Researcher",
          interestTags: ["RAG"],
          currentResearch: ["Knowledge graphs"],
          portraitSnapshot: {
            identitySummary: "Approved portrait snapshot",
            identity: { primaryRole: "Research lead" },
          },
        },
        draftGeneratedAt: "2026-03-29T00:00:00Z",
        approvedAt: "2026-03-29T00:00:00Z",
        featuredNotebooks: [],
        stats: { notebookCount: 2, topicCount: 2, sourceCount: 3, wordCount: 1000 },
      },
      isLoading: false,
    } as never);
    mockedUseMutation
      .mockReturnValueOnce({ mutate: vi.fn(), isPending: false } as never)
      .mockReturnValueOnce({ mutate: vi.fn(), isPending: false } as never)
      .mockReturnValueOnce({ mutate: vi.fn(), isPending: false } as never)
      .mockReturnValueOnce({ mutate: vi.fn(), isPending: false } as never);

    render(<PublicHomeSection />);

    expect(screen.getByText("Draft profile")).toBeInTheDocument();
    expect(screen.getByText("Approved profile")).toBeInTheDocument();
    expect(screen.getByText("Approved portrait snapshot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "generate" })).toBeInTheDocument();
  });

  it("triggers generate mutation when clicking regenerate", () => {
    const generateSpy = vi.fn();
    mockedUseQuery.mockReturnValue({
      data: {
        draftProfile: null,
        approvedProfile: null,
        featuredNotebooks: [],
        stats: { notebookCount: 0, topicCount: 0, sourceCount: 0, wordCount: 0 },
      },
      isLoading: false,
    } as never);
    mockedUseMutation
      .mockReturnValueOnce({ mutate: generateSpy, isPending: false } as never)
      .mockReturnValueOnce({ mutate: vi.fn(), isPending: false } as never)
      .mockReturnValueOnce({ mutate: vi.fn(), isPending: false } as never)
      .mockReturnValueOnce({ mutate: vi.fn(), isPending: false } as never);

    render(<PublicHomeSection />);
    fireEvent.click(screen.getByRole("button", { name: "generate" }));

    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it("triggers backfill mutation when clicking backfill", () => {
    const backfillSpy = vi.fn();
    mockedUseQuery.mockReturnValue({
      data: {
        draftProfile: null,
        approvedProfile: {
          heroSummary: "Approved profile",
          interestTags: [],
          currentResearch: [],
        },
        featuredNotebooks: [],
        stats: { notebookCount: 1, topicCount: 0, sourceCount: 0, wordCount: 0 },
      },
      isLoading: false,
    } as never);
    mockedUseMutation
      .mockReturnValueOnce({ mutate: vi.fn(), isPending: false } as never)
      .mockReturnValueOnce({ mutate: vi.fn(), isPending: false } as never)
      .mockReturnValueOnce({ mutate: backfillSpy, isPending: false } as never)
      .mockReturnValueOnce({ mutate: vi.fn(), isPending: false } as never);

    render(<PublicHomeSection />);
    fireEvent.click(screen.getByRole("button", { name: "backfillPortrait" }));

    expect(backfillSpy).toHaveBeenCalledTimes(1);
  });
});
