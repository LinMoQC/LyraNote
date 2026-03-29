import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PortraitView } from "@/features/portrait/portrait-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  m: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@/components/ui/loader", () => ({
  Loader: () => <div data-testid="loader">loader</div>,
}));

vi.mock("@/services/portrait-service", () => ({
  getMyPortrait: vi.fn(),
  triggerPortraitSynthesis: vi.fn(),
}));

vi.mock("@/lib/notify", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("@/features/portrait/portrait-cards", () => ({
  IdentityHeroCard: () => <div>IdentityHeroCard</div>,
  KnowledgeMapCard: () => <div>KnowledgeMapCard</div>,
  ThoughtStream: () => <div>ThoughtStream</div>,
  InteractionStyleCard: () => <div>InteractionStyleCard</div>,
  GrowthVelocityCard: () => <div>GrowthVelocityCard</div>,
  GrowthSignalsCard: () => <div>GrowthSignalsCard</div>,
  LyraNotesCard: () => <div>LyraNotesCard</div>,
}));

const { useQuery } = await import("@tanstack/react-query");
const mockedUseQuery = vi.mocked(useQuery);

function buildPortrait() {
  return {
    identity_summary: "summary",
    identity: {
      primary_role: "Researcher",
      expertise_level: "Senior",
      personality_type: "Analytical",
      confidence: 0.8,
    },
    knowledge_map: {
      expert_domains: ["AI"],
      learning_domains: ["Systems"],
      weak_domains: ["Math"],
      emerging_interest: ["Biology"],
    },
    work_patterns: {
      prefers_deep_focus: true,
      writing_to_reading_ratio: 0.5,
      session_style: "long",
    },
    research_trajectory: {
      current_focus: "Current topic",
      recently_completed: ["Done topic"],
      next_likely_topics: ["Next A"],
      long_term_direction: "Long direction",
    },
    interaction_style: {
      preferred_depth: "deep",
      answer_format: "bullet",
      preferred_language: "zh-CN",
      engagement_style: "proactive",
    },
    growth_signals: {
      knowledge_velocity: "medium",
      this_period_learned: ["Learned A"],
      recurring_questions: ["Question A"],
      knowledge_gaps_detected: ["Gap A"],
    },
    lyra_service_notes: "notes",
  };
}

describe("PortraitView", () => {
  it("renders loading state", () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    } as never);

    render(<PortraitView />);

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("renders content with mobile-first layout container", () => {
    mockedUseQuery.mockReturnValue({
      data: buildPortrait(),
      isLoading: false,
      refetch: vi.fn(),
    } as never);

    render(<PortraitView />);

    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByTestId("portrait-content").className).toContain("space-y-4");
    expect(screen.getByText("KnowledgeMapCard")).toBeInTheDocument();
    expect(screen.getByText("GrowthSignalsCard")).toBeInTheDocument();
  });
});
