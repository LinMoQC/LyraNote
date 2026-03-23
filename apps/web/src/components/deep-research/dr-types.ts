import { ShieldAlert, ShieldCheck, ShieldEllipsis } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClarifyOption {
  label: string;
  value: string;
}

export interface ClarifyQuestion {
  question: string;
  options: ClarifyOption[];
}

export interface DrLearning {
  question: string;
  content: string;
  citations: Array<{
    source_id?: string;
    title?: string;
    url?: string;
    excerpt?: string;
    type?: "internal" | "web";
  }>;
  evidenceGrade?: "strong" | "medium" | "weak";
  dimension?: "concept" | "latest" | "evidence" | "controversy";
  counterpoint?: string;
}

export interface DrDeliverable {
  title: string;
  summary: string;
  citationCount: number;
  nextQuestions: string[];
  evidenceStrength: "low" | "medium" | "high";
  citationTable: Array<{ conclusion: string; grade: string; source: string }>;
}

export interface DrProgress {
  status: "planning" | "searching" | "writing" | "done";
  mode: "quick" | "deep";
  subQuestions: string[];
  currentSearch?: string;
  learnings: DrLearning[];
  reportTokens: string;
  doneCitations: Array<{ title?: string; url?: string; type?: string }>;
  researchGoal?: string;
  evaluationCriteria?: string[];
  reportTitle?: string;
  deliverable?: DrDeliverable;
}

// ── Config ────────────────────────────────────────────────────────────────────

export const DIMENSION_CONFIG = {
  concept:     { labelKey: "dimension.concept", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  latest:      { labelKey: "dimension.latest",  color: "text-cyan-400",   bg: "bg-cyan-500/10 border-cyan-500/20" },
  evidence:    { labelKey: "dimension.evidence", color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
  controversy: { labelKey: "dimension.controversy", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
} as const;

export const EVIDENCE_GRADE_CONFIG = {
  strong: { dot: "bg-emerald-400", labelKey: "evidence.strong" },
  medium: { dot: "bg-amber-400",   labelKey: "evidence.medium" },
  weak:   { dot: "bg-red-400",     labelKey: "evidence.weak" },
} as const;

export const EVIDENCE_STRENGTH_CONFIG = {
  high:   { labelKey: "strength.high",   icon: ShieldCheck,    color: "text-emerald-400 border-emerald-400/30 bg-emerald-500/10" },
  medium: { labelKey: "strength.medium", icon: ShieldEllipsis, color: "text-amber-400 border-amber-400/30 bg-amber-500/10" },
  low:    { labelKey: "strength.low",    icon: ShieldAlert,    color: "text-red-400 border-red-400/30 bg-red-500/10" },
} as const;
