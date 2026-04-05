"use client";

const THOUGHT_SURFACE_COOLDOWN_MS = 30 * 60 * 1000;
const THOUGHT_FINGERPRINT_WINDOW_MS = 6 * 60 * 60 * 1000;
const RECENT_INTERACTION_WINDOW_MS = 20 * 1000;
const THOUGHT_SURFACE_STORAGE_KEY = "lyra:thought-surface-history";

export function createSuggestionFingerprint(
  origin: "source_indexed" | "proactive_insight" | "lyra_thought",
  payload: {
    sourceId?: string;
    sourceName?: string;
    summary?: string;
    message?: string;
    questions?: string[];
  },
): string {
  if (origin === "source_indexed") {
    return `source:${payload.sourceId ?? normalizeText(payload.sourceName ?? payload.summary ?? "")}`;
  }

  const text = payload.message
    ?? payload.summary
    ?? payload.questions?.join("|")
    ?? "";

  const prefix = origin === "lyra_thought" ? "thought" : "insight";
  return `${prefix}:${normalizeText(text)}`;
}

export function shouldAutoSurfaceSource(isMobile: boolean): boolean {
  return !isMobile;
}

export function shouldAutoSurfaceThought(input: ThoughtSurfaceInput): boolean {
  const {
    fingerprint,
    isMobile,
    copilotOpen,
    streaming,
    hasActiveSurface,
    lastInteractionAt,
    now = Date.now(),
  } = input;

  if (!fingerprint || isMobile || copilotOpen || streaming || hasActiveSurface) {
    return false;
  }

  if (now - lastInteractionAt < RECENT_INTERACTION_WINDOW_MS) {
    return false;
  }

  const history = readThoughtSurfaceHistory();
  if (now - history.lastSurfacedAt < THOUGHT_SURFACE_COOLDOWN_MS) {
    return false;
  }

  const lastFingerprintAt = history.fingerprints[fingerprint];
  if (lastFingerprintAt && now - lastFingerprintAt < THOUGHT_FINGERPRINT_WINDOW_MS) {
    return false;
  }

  return true;
}

export function rememberThoughtSurface(fingerprint: string, now = Date.now()): void {
  const history = readThoughtSurfaceHistory();
  history.lastSurfacedAt = now;
  history.fingerprints[fingerprint] = now;

  for (const [key, ts] of Object.entries(history.fingerprints)) {
    if (now - ts > THOUGHT_FINGERPRINT_WINDOW_MS) {
      delete history.fingerprints[key];
    }
  }

  writeThoughtSurfaceHistory(history);
}

export function __resetThoughtSurfaceHistoryForTests(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(THOUGHT_SURFACE_STORAGE_KEY);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 160);
}

function readThoughtSurfaceHistory(): ThoughtSurfaceHistory {
  if (typeof window === "undefined") {
    return { lastSurfacedAt: 0, fingerprints: {} };
  }

  const raw = window.localStorage.getItem(THOUGHT_SURFACE_STORAGE_KEY);
  if (!raw) {
    return { lastSurfacedAt: 0, fingerprints: {} };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ThoughtSurfaceHistory>;
    return {
      lastSurfacedAt: typeof parsed.lastSurfacedAt === "number" ? parsed.lastSurfacedAt : 0,
      fingerprints: typeof parsed.fingerprints === "object" && parsed.fingerprints
        ? Object.fromEntries(
            Object.entries(parsed.fingerprints).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
          )
        : {},
    };
  } catch {
    return { lastSurfacedAt: 0, fingerprints: {} };
  }
}

function writeThoughtSurfaceHistory(history: ThoughtSurfaceHistory): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THOUGHT_SURFACE_STORAGE_KEY, JSON.stringify(history));
}

interface ThoughtSurfaceInput {
  fingerprint: string;
  isMobile: boolean;
  copilotOpen: boolean;
  streaming: boolean;
  hasActiveSurface: boolean;
  lastInteractionAt: number;
  now?: number;
}

interface ThoughtSurfaceHistory {
  lastSurfacedAt: number;
  fingerprints: Record<string, number>;
}
