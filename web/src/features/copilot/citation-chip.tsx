"use client"

import { AnimatePresence, m } from "framer-motion"
import { ChevronDown, FileText, Globe } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"
import type { CitationData } from "@/types"
import { useTranslations } from "next-intl"

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return null
  const pct = Math.round(score * 100)
  const color =
    pct >= 70 ? "text-emerald-400 bg-emerald-400/10" :
    pct >= 40 ? "text-amber-400 bg-amber-400/10" :
    "text-muted-foreground/60 bg-muted/50"
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums", color)}>
      {pct}%
    </span>
  )
}

function getSourceIcon(title: string) {
  if (title.endsWith(".pdf") || title.endsWith(".docx") || title.endsWith(".doc"))
    return FileText
  if (title.startsWith("http") || title.includes("://"))
    return Globe
  return FileText
}

export function CitationCard({
  citation,
  index,
  compact,
}: {
  citation: CitationData
  index: number
  compact?: boolean
}) {
  const tc = useTranslations("common")
  const [expanded, setExpanded] = useState(false)
  const Icon = getSourceIcon(citation.source_title)

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="group relative inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5 text-left transition-all hover:border-primary/25 hover:bg-primary/[0.06]"
      >
        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-[9px] font-bold text-primary">
          {index}
        </span>
        <span className="max-w-[140px] truncate text-[11px] text-foreground/70 group-hover:text-foreground/90">
          {citation.source_title}
        </span>
        <ScoreBadge score={citation.score} />
      </button>
    )
  }

  return (
    <m.div
      layout
      className="overflow-hidden rounded-xl border border-border/40 bg-muted/20 transition-colors hover:border-border/50"
    >
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-[10px] font-bold text-primary">
          {index}
        </span>
        <Icon size={12} className="flex-shrink-0 text-muted-foreground/50" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/80">
          {citation.source_title}
        </span>
        <ScoreBadge score={citation.score} />
        <ChevronDown
          size={10}
          className={cn(
            "flex-shrink-0 text-muted-foreground/30 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30 px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-muted-foreground/60">
                {citation.excerpt || tc("noSummary")}
              </p>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}

export function CitationList({
  citations,
  compact,
}: {
  citations: CitationData[]
  compact?: boolean
}) {
  const t = useTranslations("copilot")
  if (!citations.length) return null

  if (compact) {
    return (
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {citations.map((c, i) => (
          <CitationCard key={c.chunk_id} citation={c} index={i + 1} compact />
        ))}
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-1.5">
      <p className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground/50">
        <FileText size={10} />
        {t("refSources")}
      </p>
      <div className="space-y-1">
        {citations.map((c, i) => (
          <CitationCard key={c.chunk_id} citation={c} index={i + 1} />
        ))}
      </div>
    </div>
  )
}
