"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { buildMarkdownComponents } from "@/components/genui";
import { DrDocumentCard } from "./dr-document-card";
import type { DrProgress } from "./dr-types";

// ── Sub-question chips with collapse ────────────────────────────────────────

const PLAN_PREVIEW = 5

function SubQuestionChips({ questions }: { questions: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? questions : questions.slice(0, PLAN_PREVIEW)
  const hidden = questions.length - PLAN_PREVIEW

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((q, i) => (
        <m.span
          key={i}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.02 }}
          className="inline-flex max-w-[260px] items-center gap-1 truncate rounded-md border border-border/20 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground/65"
        >
          <span className="shrink-0 text-muted-foreground/35">{i + 1}</span>
          <span className="truncate">{q}</span>
        </m.span>
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

// ── Completed search chips ───────────────────────────────────────────────────

function SearchChip({ question }: { question: string }) {
  return (
    <m.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex max-w-[260px] items-center gap-1 truncate rounded-md border border-emerald-500/15 bg-emerald-500/8 px-1.5 py-0.5 text-[10px] text-emerald-400/60"
    >
      <CheckCircle2 size={8} className="shrink-0" />
      <span className="truncate">{question}</span>
    </m.span>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, count, colorClass }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  count?: number
  colorClass: string
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon size={11} className={colorClass} />
      <span className="text-[11px] font-medium text-muted-foreground/65">{label}</span>
      {count !== undefined && (
        <span className="ml-0.5 text-[9px] text-muted-foreground/35">· {count}</span>
      )}
    </div>
  )
}

// ── Drawer ────────────────────────────────────────────────────────────────────

interface DrResearchDrawerProps {
  open: boolean
  progress: DrProgress | null
  mode: "quick" | "deep"
  isActive: boolean
  onClose: () => void
  onSaveNote?: (report?: string, title?: string) => void
  onSaveSources?: () => void
  onFollowUp?: (q: string) => void
  onRate?: (rating: "like" | "dislike") => void
  onCopy?: (text: string) => void
  savedMessageId?: string | null
}

export function DrResearchDrawer({
  open,
  progress,
  mode,
  isActive,
  onClose,
  onSaveNote,
  onSaveSources,
  onFollowUp,
  onRate,
  onCopy,
  savedMessageId,
}: DrResearchDrawerProps) {
  const t = useTranslations("deepResearch")
  const scrollRef = useRef<HTMLDivElement>(null)

  const isDone = progress?.status === "done"
  const isSearching = progress?.status === "searching"
  const isWriting = progress?.status === "writing"

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — not clickable during active research to prevent accidental close */}
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={isActive ? undefined : onClose}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
          />

          {/* Drawer panel */}
          <m.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed inset-y-0 right-0 z-50 flex w-[460px] max-w-[92vw] flex-col border-l border-border/40 bg-card shadow-2xl"
          >
            {/* Top bar */}
            <div className="flex shrink-0 items-center justify-between border-b border-border/30 px-4 py-3">
              <div className="flex items-center gap-2">
                {isActive ? (
                  <Loader2 size={13} className="animate-spin text-amber-400" />
                ) : (
                  <CheckCircle2 size={13} className="text-emerald-400" />
                )}
                <span className="text-[13px] font-medium text-foreground/85 truncate max-w-[300px]">
                  {progress?.reportTitle ?? t("inProgress")}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/40 hover:text-muted-foreground/80"
              >
                <X size={14} />
              </button>
            </div>

            {/* Scrollable content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-5 no-scrollbar">
              {progress ? (
                <>
                  {/* Planning section */}
                  {progress.subQuestions.length > 0 && (
                    <section>
                      <SectionHeader
                        icon={BookOpen}
                        label={t("planPhase")}
                        count={progress.subQuestions.length}
                        colorClass="text-violet-400/70"
                      />
                      <SubQuestionChips questions={progress.subQuestions} />
                    </section>
                  )}

                  {/* Completed searches */}
                  {progress.learnings.length > 0 && (
                    <section>
                      <SectionHeader
                        icon={Search}
                        label={t("searchingStep")}
                        count={progress.learnings.length}
                        colorClass="text-blue-400/70"
                      />
                      <div className="flex flex-wrap gap-1">
                        {progress.learnings.map((l, i) => (
                          <SearchChip key={i} question={l.question} />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Active search */}
                  <AnimatePresence>
                    {isSearching && progress.currentSearch && (
                      <m.div
                        key="active"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <Loader2 size={10} className="animate-spin text-primary/55" />
                        <span className="text-[11px] text-muted-foreground/55 truncate">
                          {progress.currentSearch}
                        </span>
                      </m.div>
                    )}
                  </AnimatePresence>

                  {/* Writing / streaming report */}
                  {(isWriting || (isDone && progress.reportTokens)) && (
                    <section>
                      <SectionHeader
                        icon={Sparkles}
                        label={isDone ? t("reportDone") : t("reportWriting")}
                        colorClass="text-amber-400/70"
                      />

                      {isDone && progress.reportTokens ? (
                        // Full done state — show document card
                        <DrDocumentCard
                          progress={progress}
                          onOpen={() => {}}
                          onSaveNote={onSaveNote}
                          onSaveSources={onSaveSources}
                          onCopy={onCopy}
                        />
                      ) : (
                        // Streaming preview
                        <div className="rounded-xl border border-border/30 bg-muted/15 px-4 py-4">
                          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground/80 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-xs [&_h3]:font-semibold [&_li]:my-0.5 [&_p]:my-1.5 [&_strong]:font-semibold [&_strong]:text-foreground">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={buildMarkdownComponents({ isMermaidStreaming: true })}
                            >
                              {progress.reportTokens}
                            </ReactMarkdown>
                          </div>
                          {isWriting && (
                            <div className="mt-2 flex items-center gap-1.5">
                              <Loader2 size={9} className="animate-spin text-amber-400/60" />
                              <span className="text-[10px] text-muted-foreground/45">{t("reportWriting")}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {/* Planning skeleton when no data yet */}
                  {progress.subQuestions.length === 0 && !isWriting && !isDone && (
                    <div className="space-y-2 pt-2">
                      {[75, 55, 85, 60, 70].map((w, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="h-3.5 w-3.5 rounded-full bg-muted/35 animate-pulse" />
                          <div
                            className="h-3 animate-pulse rounded bg-muted/35"
                            style={{ width: `${w}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* No progress yet */
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Loader2 size={24} className="animate-spin text-muted-foreground/30 mb-3" />
                  <p className="text-[12px] text-muted-foreground/40">{t("planningStep")}</p>
                </div>
              )}
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}
