"use client";

import { m } from "framer-motion";
import { CheckCircle2, ExternalLink, Loader2, Search, Sparkles, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import type { DrProgress } from "./dr-types";

interface DrProgressCardProps {
  progress: DrProgress
  mode: "quick" | "deep"
  onOpenDrawer: () => void
}

export function DrProgressCard({ progress, mode, onOpenDrawer }: DrProgressCardProps) {
  const t = useTranslations("deepResearch")
  const { status, subQuestions, learnings, reportTitle, currentSearch } = progress

  const isSearching = status === "searching"
  const isWriting = status === "writing"

  function statusText() {
    if (isWriting) return t("reportWriting")
    if (isSearching && currentSearch) return currentSearch
    if (isSearching) return t("searchingStep")
    return t("planningStep")
  }

  function progressLabel() {
    if (isWriting) return `${learnings.length} 项已完成`
    if (isSearching || learnings.length > 0) {
      const total = subQuestions.length
      const done = learnings.length
      return total > 0 ? `${done} / ${total}` : `${done} 项已完成`
    }
    return null
  }

  const label = progressLabel()

  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border/40 bg-card shadow-sm"
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10">
          {isWriting ? (
            <Sparkles size={14} className="text-amber-400" />
          ) : (
            <Loader2 size={14} className="animate-spin text-amber-400" />
          )}
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-foreground/85">
              {reportTitle ?? t("inProgress")}
            </span>
            <span className="shrink-0 rounded-full border border-border/20 bg-muted/30 px-1.5 py-0.5 text-[9px] text-muted-foreground/40">
              <Zap size={7} className="mr-0.5 inline" />
              {mode === "quick" ? t("quickMode") : t("deepMode")}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-[11px] text-muted-foreground/55">
              {statusText()}
            </span>
            {label && (
              <span className="shrink-0 rounded-full bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground/45">
                {label}
              </span>
            )}
          </div>
        </div>

        {/* Open drawer button */}
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-muted-foreground/80"
        >
          <ExternalLink size={10} />
          <span>{t("openResearchDrawer")}</span>
        </button>
      </div>

      {/* Mini progress bar */}
      {subQuestions.length > 0 && (
        <div className="h-0.5 bg-muted/30">
          <m.div
            className="h-full bg-gradient-to-r from-amber-500/40 to-primary/40"
            initial={{ width: "0%" }}
            animate={{
              width: isWriting
                ? "90%"
                : `${Math.min(95, (learnings.length / Math.max(subQuestions.length, 1)) * 85)}%`,
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      )}
    </m.div>
  )
}
