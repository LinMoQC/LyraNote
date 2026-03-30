import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { PublicHomePage } from "@/features/public-home/public-home-page";

function createMotionTag(tagName: string) {
  return ({
    children,
    initial: _initial,
    animate: _animate,
    variants: _variants,
    whileInView: _whileInView,
    whileHover: _whileHover,
    viewport: _viewport,
    transition: _transition,
    ...props
  }: { children?: ReactNode; [key: string]: unknown }) => createElement(tagName, props, children);
}

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join("-")}` : key,
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("framer-motion", () => ({
  m: {
    nav: createMotionTag("nav"),
    section: createMotionTag("section"),
    div: createMotionTag("div"),
    p: createMotionTag("p"),
    aside: createMotionTag("aside"),
    span: createMotionTag("span"),
  },
  useScroll: () => ({ scrollY: 0 }),
  useTransform: (_value: unknown, _input: unknown, output: unknown) =>
    Array.isArray(output) ? output[0] : output,
  useInView: () => true,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/features/notebook/notebook-icons", () => ({
  pickDefaultIcon: () => "book",
  getNotebookIcon: () => () => <div data-testid="notebook-icon" />,
}));

const { useQuery } = await import("@tanstack/react-query");
const mockedUseQuery = vi.mocked(useQuery);

describe("PublicHomePage", () => {
  it("renders the AI public profile and timeline when approved profile exists", () => {
    mockedUseQuery.mockReturnValue({
      data: {
        profile: {
          heroSummary: "Public summary",
          professionGuess: "Researcher",
          interestTags: ["AI", "RAG"],
          currentResearch: ["Agentic workflows"],
          timelineItems: [
            { title: "Phase 1", summary: "Started exploring", timeLabel: "最近", sourceNotebookIds: ["nb-1"] },
          ],
          topicClusters: ["AI"],
          featuredNotebookIds: ["nb-1"],
          generatedAt: "2026-03-29T00:00:00Z",
          isAiGenerated: true,
        },
        featuredNotebooks: [
          {
            id: "nb-1",
            title: "Open Notebook",
            description: "desc",
            summary: "summary",
            sourceCount: 2,
            wordCount: 1200,
          },
        ],
        recentNotebooks: [],
        notebooks: [],
        stats: { notebookCount: 1, topicCount: 1, sourceCount: 2, wordCount: 1200 },
      },
      isLoading: false,
    } as never);

    render(<PublicHomePage />);

    expect(screen.getAllByText("Public summary").length).toBeGreaterThan(0);
    expect(screen.getByText("Phase 1")).toBeInTheDocument();
    expect(screen.getAllByText("Open Notebook").length).toBeGreaterThan(0);
    expect(screen.getAllByText("knowledgeMastered")).toHaveLength(1);
    expect(screen.getAllByText("knowledgeLearning")).toHaveLength(1);
    expect(screen.getAllByText("knowledgeEmerging")).toHaveLength(1);
    expect(screen.queryByText("heroStatNotebooks")).not.toBeInTheDocument();
    expect(screen.queryByText("heroStatWritten")).not.toBeInTheDocument();
    expect(screen.queryByText("heroStatSources")).not.toBeInTheDocument();
  });

  it("falls back to notebook archive mode when no approved profile exists", () => {
    mockedUseQuery.mockReturnValue({
      data: {
        profile: null,
        featuredNotebooks: [],
        recentNotebooks: [],
        notebooks: [
          {
            id: "nb-2",
            title: "Archive Notebook",
            description: "desc",
            sourceCount: 1,
            wordCount: 300,
          },
        ],
        stats: { notebookCount: 1, topicCount: 0, sourceCount: 1, wordCount: 300 },
      },
      isLoading: false,
    } as never);

    render(<PublicHomePage />);

    expect(screen.getByText("archiveTitle")).toBeInTheDocument();
    expect(screen.queryByText("researchTrajectoryTitle")).not.toBeInTheDocument();
    expect(screen.getByText("Archive Notebook")).toBeInTheDocument();
  });
});
