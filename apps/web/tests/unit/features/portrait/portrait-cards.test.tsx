import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { UserPortrait } from "@/services/portrait-service";
import { ThoughtStream } from "@/features/portrait/portrait-cards";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function buildPortrait(): UserPortrait {
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
      next_likely_topics: ["Next A", "Next B"],
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

describe("ThoughtStream", () => {
  it("handles rerender from empty to populated trajectory", () => {
    const portrait = buildPortrait();
    const withoutTrajectory = {
      ...portrait,
      research_trajectory: null as unknown as UserPortrait["research_trajectory"],
    };

    const { container, rerender } = render(<ThoughtStream portrait={withoutTrajectory} />);
    expect(container.firstChild).toBeNull();

    expect(() => {
      rerender(<ThoughtStream portrait={portrait} />);
    }).not.toThrow();

    expect(screen.getByText("trajectory")).toBeInTheDocument();
    expect(screen.getByText("Current topic")).toBeInTheDocument();
  });
});
