import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetThoughtSurfaceHistoryForTests,
  createSuggestionFingerprint,
  rememberThoughtSurface,
  shouldAutoSurfaceSource,
  shouldAutoSurfaceThought,
} from "@/features/copilot/proactive-surface-policy";

describe("proactive surface policy", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetThoughtSurfaceHistoryForTests();
  });

  it("keeps lyra thoughts in inbox when copilot is already open", () => {
    const allow = shouldAutoSurfaceThought({
      fingerprint: "thought:test",
      isMobile: false,
      copilotOpen: true,
      streaming: false,
      hasActiveSurface: false,
      lastInteractionAt: 0,
      now: 100_000,
    });

    expect(allow).toBe(false);
  });

  it("surfaces lyra thoughts only after the user has been idle on desktop", () => {
    const allow = shouldAutoSurfaceThought({
      fingerprint: "thought:test",
      isMobile: false,
      copilotOpen: false,
      streaming: false,
      hasActiveSurface: false,
      lastInteractionAt: 0,
      now: 2_000_000,
    });

    expect(allow).toBe(true);
  });

  it("blocks repeated thought fingerprints during the six hour dedupe window", () => {
    rememberThoughtSurface("thought:repeat", 100_000);

    const allow = shouldAutoSurfaceThought({
      fingerprint: "thought:repeat",
      isMobile: false,
      copilotOpen: false,
      streaming: false,
      hasActiveSurface: false,
      lastInteractionAt: 0,
      now: 100_000 + 60_000,
    });

    expect(allow).toBe(false);
  });

  it("blocks all source auto-surface on mobile", () => {
    expect(shouldAutoSurfaceSource(true)).toBe(false);
    expect(shouldAutoSurfaceSource(false)).toBe(true);
  });

  it("builds stable fingerprints from the event origin", () => {
    expect(
      createSuggestionFingerprint("source_indexed", {
        sourceId: "src-1",
        sourceName: "Paper A",
      }),
    ).toBe("source:src-1");

    expect(
      createSuggestionFingerprint("lyra_thought", {
        message: "  A Fresh Insight About Attention  ",
      }),
    ).toBe("thought:a fresh insight about attention");
  });
});
