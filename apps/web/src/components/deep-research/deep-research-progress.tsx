"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Search,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DrDocumentCard } from "./dr-document-card";
import { DrDocumentViewer } from "./dr-document-viewer";
import type { DrProgress } from "./dr-types";

export type { DrLearning, DrDeliverable, DrProgress, DrPlanData } from "./dr-types";

// ── Sub-question chips with collapse ──────────────────────────────────────────

const PLAN_PREVIEW = 5

function SubQuestionChips({ questions }: { questions: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? questions : questions.slice(0, PLAN_PREVIEW)
  const hidden = questions.length - PLAN_PREVIEW
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((q, i) => (
        <span
          key={i}
          className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-md border border-border/20 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground/65"
        >
          <span className="shrink-0 text-muted-foreground/35">{i + 1}</span>
          <span className="truncate">{q}</span>
        </span>
      ))}
      {!expanded && hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center rounded-md border border-border/20 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground/45 transition-colors hover:bg-muted/40"
        >
          +{hidden}
        </button>
      )}
    </div>
  )
}

// ── Done state (used in chat history) ─────────────────────────────────────────

export function DeepResearchProgress({
  progress,
  onSaveNote,
  onSaveSources,
  onFollowUp,
  onRate,
  onCopy,
  savedMessageId,
}: {
  progress: DrProgress;
  onSaveNote?: (report?: string, title?: string) => void;
  onSaveSources?: () => void;
  onFollowUp?: (q: string) => void;
  onRate?: (rating: "like" | "dislike") => void;
  onCopy?: (text: string) => void;
  savedMessageId?: string | null;
}) {
  const { status, subQuestions, learnings, reportTokens } = progress
  const isDone = status === "done"

  const t = useTranslations("deepResearch")
  const [viewerOpen, setViewerOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)

  // Only render in done state — streaming is handled by DrProgressCard + DrResearchDrawer
  if (!isDone || !reportTokens) return null

  return (
    <div className="w-full max-w-2xl">
      {subQuestions.length > 0 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setTimelineOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground/50 transition-colors hover:bg-muted/40 hover:text-muted-foreground/70"
          >
            {timelineOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Search size={10} />
            <span>{t("viewResearchProcess")}</span>
          </button>
          <AnimatePresence>
            {timelineOpen && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-3 rounded-xl border border-border/30 bg-muted/20 px-3 py-3">
                  {/* Planning */}
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <BookOpen size={10} className="text-violet-400/70" />
                      <span className="text-[10px] font-medium text-muted-foreground/60">{t("planPhase")}</span>
                      <span className="text-[9px] text-muted-foreground/35">· {subQuestions.length} 项</span>
                    </div>
                    <SubQuestionChips questions={subQuestions} />
                  </div>
                  {/* Searches */}
                  {learnings.length > 0 && (
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Search size={10} className="text-blue-400/70" />
                        <span className="text-[10px] font-medium text-muted-foreground/60">{t("searchingStep")}</span>
                        <span className="text-[9px] text-muted-foreground/35">· {learnings.length} 次</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {learnings.map((l, i) => (
                          <span
                            key={i}
                            className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-md border border-emerald-500/15 bg-emerald-500/8 px-1.5 py-0.5 text-[10px] text-emerald-400/55"
                          >
                            <CheckCircle2 size={8} className="shrink-0" />
                            <span className="truncate">{l.question}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Done */}
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={10} className="text-amber-400/70" />
                    <span className="text-[10px] text-muted-foreground/50">{t("reportDone")}</span>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <DrDocumentCard
        progress={progress}
        onOpen={() => setViewerOpen(true)}
        onSaveNote={onSaveNote}
        onSaveSources={onSaveSources}
        onCopy={onCopy}
      />
      <DrDocumentViewer
        open={viewerOpen}
        progress={progress}
        onClose={() => setViewerOpen(false)}
        onSaveNote={onSaveNote}
        onSaveSources={onSaveSources}
        onFollowUp={onFollowUp}
        onRate={onRate}
        onCopy={onCopy}
        savedMessageId={savedMessageId}
      />
    </div>
  )
}
