"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { DrDocumentCard } from "./dr-document-card";
import { DrDocumentViewer } from "./dr-document-viewer";
import { LearningCard } from "./dr-learning-card";
import type { DrProgress } from "./dr-types";

export type { DrLearning, DrDeliverable, DrProgress } from "./dr-types";

// ── Small helpers ─────────────────────────────────────────────────────────────

function Connector({ active }: { active?: boolean }) {
  return (
    <div className="mx-auto mt-0.5 w-px flex-1" style={{ minHeight: 8 }}>
      {active ? (
        <m.div
          className="h-full w-full rounded-full"
          style={{ background: "linear-gradient(to bottom, hsl(var(--primary)/0.5), hsl(var(--primary)/0.15))" }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <div className="h-full w-full rounded-full bg-muted/60" />
      )}
    </div>
  );
}

function StatusDot({ done, active }: { done: boolean; active: boolean }) {
  if (done)
    return (
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
        <CheckCircle2 size={14} className="text-emerald-400" />
      </div>
    );
  if (active)
    return (
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
        <Loader2 size={12} className="animate-spin text-primary" />
      </div>
    );
  return (
    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
      <div className="h-2 w-2 rounded-full bg-muted/60" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DeepResearchProgress({
  progress,
  onSaveNote,
  onFollowUp,
  onRate,
  onCopy,
  savedMessageId,
}: {
  progress: DrProgress;
  onSaveNote?: (report?: string, title?: string) => void;
  onFollowUp?: (q: string) => void;
  onRate?: (rating: "like" | "dislike") => void;
  onCopy?: (text: string) => void;
  savedMessageId?: string | null;
}) {
  const { status, mode, subQuestions, currentSearch, learnings, reportTokens, researchGoal } =
    progress;

  const isDone = status === "done";
  const isWriting = status === "writing";
  const isSearching = status === "searching";

  const t = useTranslations("deepResearch");
  const _tc = useTranslations("common");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // ── Done state: show collapsible timeline + document card + viewer modal ──
  if (isDone && reportTokens) {
    return (
      <div className="w-full max-w-2xl">
        {/* Collapsible research timeline */}
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
                  <div className="mt-2 rounded-xl border border-border/30 bg-muted/20 px-1 py-2">
                    {/* Planning phase */}
                    <div className="flex gap-2 px-2">
                      <div className="flex w-5 flex-shrink-0 flex-col items-center">
                        <StatusDot done active={false} />
                        {learnings.length > 0 && <Connector />}
                      </div>
                      <div className="min-w-0 flex-1 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <BookOpen size={11} className="text-violet-400/80" />
                          <span className="text-xs font-medium text-foreground/70">{t("planPhase")}</span>
                        </div>
                        <div className="mt-1.5 space-y-1">
                          {subQuestions.map((q, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full bg-accent/60 text-[9px] text-muted-foreground/60">
                                {i + 1}
                              </span>
                              <span className="text-[11px] text-muted-foreground/70">{q}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Learnings */}
                    {learnings.map((learning, i) => (
                      <div key={i} className="flex gap-2 px-2">
                        <div className="flex w-5 flex-shrink-0 flex-col items-center">
                          <StatusDot done active={false} />
                          {i < learnings.length - 1 && <Connector />}
                        </div>
                        <div className="min-w-0 flex-1 py-1">
                          <div className="flex items-center gap-1.5">
                            <Search size={10} className="text-blue-400/80" />
                            <span className="truncate text-[11px] text-muted-foreground/60">{learning.question}</span>
                          </div>
                          <LearningCard learning={learning} />
                        </div>
                      </div>
                    ))}

                    {/* Writing done */}
                    <div className="flex gap-2 px-2">
                      <div className="flex w-5 flex-shrink-0 flex-col items-center">
                        <StatusDot done active={false} />
                      </div>
                      <div className="min-w-0 flex-1 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={10} className="text-amber-400/80" />
                          <span className="text-[11px] text-muted-foreground/60">{t("reportDone")}</span>
                        </div>
                      </div>
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
          onCopy={onCopy}
        />
        <DrDocumentViewer
          open={viewerOpen}
          progress={progress}
          onClose={() => setViewerOpen(false)}
          onSaveNote={onSaveNote}
          onFollowUp={onFollowUp}
          onRate={onRate}
          onCopy={onCopy}
          savedMessageId={savedMessageId}
        />
      </div>
    );
  }

  // ── Streaming state: show live research timeline ──
  return (
    <div className="w-full max-w-2xl">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1">
          <Loader2 size={11} className="animate-spin text-amber-400" />
          <span className="text-[11px] font-medium text-amber-300/90">
            {t("inProgress")}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border/30 bg-muted/30 px-2 py-0.5">
          <Zap size={9} className="text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/50">
            {mode === "quick" ? t("quickMode") : t("deepMode")}
          </span>
        </div>
      </div>

      {/* Research goal */}
      {researchGoal && (
        <p className="mb-2 text-[10px] italic text-muted-foreground/50">{t("goal", { goal: researchGoal })}</p>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-border/30 bg-muted/20 px-1 py-2">
        {/* Planning phase */}
        <m.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2 px-2">
          <div className="flex w-5 flex-shrink-0 flex-col items-center">
            <StatusDot done={subQuestions.length > 0} active={status === "planning"} />
            {(subQuestions.length > 0 || isSearching || isWriting) && (
              <Connector active={status === "planning"} />
            )}
          </div>
          <div className="min-w-0 flex-1 py-1.5">
            <div className="flex items-center gap-1.5">
              <BookOpen size={11} className="text-violet-400/80" />
              <span className="text-xs font-medium text-foreground/70">{t("planPhase")}</span>
            </div>
            {subQuestions.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {subQuestions.map((q, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full bg-accent/60 text-[9px] text-muted-foreground/60">
                      {i + 1}
                    </span>
                    <span className="text-[11px] text-muted-foreground/70">{q}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </m.div>

        {/* Learnings */}
        <AnimatePresence>
          {learnings.map((learning, i) => (
            <m.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex gap-2 px-2"
            >
              <div className="flex w-5 flex-shrink-0 flex-col items-center">
                <StatusDot done active={false} />
                {(i < learnings.length - 1 || isSearching || isWriting) && <Connector active={false} />}
              </div>
              <div className="min-w-0 flex-1 py-1">
                <div className="flex items-center gap-1.5">
                  <Search size={10} className="text-blue-400/80" />
                  <span className="truncate text-[11px] text-muted-foreground/60">{learning.question}</span>
                </div>
                <LearningCard learning={learning} />
              </div>
            </m.div>
          ))}
        </AnimatePresence>

        {/* Current search in progress */}
        <AnimatePresence>
          {isSearching && currentSearch && (
            <m.div
              key="current-search"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex gap-2 px-2"
            >
              <div className="flex w-5 flex-shrink-0 flex-col items-center">
                <StatusDot done={false} active />
                {isWriting && <Connector active />}
              </div>
              <div className="min-w-0 flex-1 py-1.5">
                <div className="flex items-center gap-1.5">
                  <Loader2 size={10} className="animate-spin text-primary/70" />
                  <span className="truncate text-[11px] text-muted-foreground/60">{currentSearch}</span>
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Writing phase */}
        <AnimatePresence>
          {isWriting && (
            <m.div
              key="writing"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-2 px-2"
            >
              <div className="flex w-5 flex-shrink-0 flex-col items-center">
                <StatusDot done={false} active={isWriting} />
              </div>
              <div className="min-w-0 flex-1 py-1.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={10} className="text-amber-400/80" />
                  <span className="text-[11px] text-muted-foreground/60">
                    {t("reportWriting")}
                  </span>
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* Streaming report preview */}
      <AnimatePresence>
        {reportTokens && (
          <m.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mt-3 max-h-60 overflow-hidden rounded-xl border border-border/40 bg-muted/20 px-4 py-4"
          >
            <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground/85 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-xs [&_h3]:font-semibold [&_li]:my-0.5 [&_p]:my-1.5 [&_strong]:font-semibold [&_strong]:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportTokens}</ReactMarkdown>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
