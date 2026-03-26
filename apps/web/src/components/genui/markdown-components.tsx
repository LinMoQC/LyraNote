"use client"

import { Fragment, useEffect, useCallback } from "react"
import type React from "react"
import { useTranslations } from "next-intl"
import type { CitationData } from "@/types"
import { processChildren } from "@/features/chat/chat-helpers"
import { MermaidBlock } from "@/components/message-render/mermaid-block"
import { ChartBlock } from "./chart-block"
import { TableBlock } from "./table-block"
import { CardBlock } from "./card-block"
import { FormulaBlock } from "./formula-block"
import { PaperCardBlock } from "./paper-card-block"
import { QuizBlock } from "./quiz-block"
import { TimelineBlock } from "./timeline-block"
import { StepsBlock } from "./steps-block"
import { DiffBlock } from "./diff-block"
import { MatrixBlock } from "./matrix-block"
import { KanbanBlock } from "./kanban-block"
import { GraphBlock } from "./graph-block"
import { WordCloudBlock } from "./wordcloud-block"
import { HeatmapBlock } from "./heatmap-block"
import { safeParseJSON, extractArtifactHtml } from "./utils"

export interface ArtifactPayload {
  type: "html"
  content: string
  title: string
}

export interface MarkdownComponentsOpts {
  citations?: CitationData[]
  isMermaidStreaming?: boolean
  onArtifact?: (payload: ArtifactPayload) => void
  CodeBlock?: React.ComponentType<{ code: string; language?: string }>
}

interface GenUIPayload {
  type: string
  props?: Record<string, unknown> | Array<Record<string, unknown>>
  components?: GenUIPayload[]
}

function renderGenUIComponent(
  parsed: GenUIPayload,
  opts: { onArtifact?: (p: ArtifactPayload) => void },
): React.ReactNode {
  const { type, props } = parsed
  const code = JSON.stringify(props)

  switch (type) {
    case "chart":         return <ChartBlock code={code} />
    case "table":         return <TableBlock code={code} />
    case "card":          return <CardBlock code={code} />
    case "formula":       return <FormulaBlock code={typeof props === "object" && props !== null && !Array.isArray(props) ? String((props as Record<string, unknown>).content ?? "") : ""} />
    case "paper-card":    return <PaperCardBlock code={code} />
    case "quiz":          return <QuizBlock code={code} />
    case "timeline":      return <TimelineBlock code={code} />
    case "steps":         return <StepsBlock code={code} />
    case "diff":          return <DiffBlock code={code} />
    case "matrix":        return <MatrixBlock code={code} />
    case "kanban":        return <KanbanBlock code={code} />
    case "graph":         return <GraphBlock code={code} />
    case "wordcloud":     return <WordCloudBlock code={code} />
    case "heatmap":       return <HeatmapBlock code={code} />
    case "artifact-html": {
      const content = typeof props === "object" && props !== null && !Array.isArray(props)
        ? String((props as Record<string, unknown>).content ?? "")
        : ""
      return <ArtifactCard content={content} onArtifact={opts.onArtifact} />
    }
    case "group":
      return <>{parsed.components?.map((c, i) => (
        <Fragment key={i}>{renderGenUIComponent(c, opts)}</Fragment>
      ))}</>
    default:
      return null
  }
}

function ArtifactCard({
  content,
  onArtifact,
}: {
  content: string
  onArtifact?: (p: ArtifactPayload) => void
}) {
  const t = useTranslations("genui")
  const open = useCallback(() => {
    onArtifact?.({ type: "html", content, title: t("artifactTitle") })
  }, [onArtifact, content, t])

  useEffect(() => { open() }, [open])

  return (
    <button
      type="button"
      onClick={open}
      className="my-3 flex w-full items-center gap-3 rounded-xl border border-indigo-500/25 bg-indigo-500/8 px-4 py-3 text-left transition-colors hover:bg-indigo-500/15"
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
        <svg className="h-4 w-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-indigo-300">{t("artifactTitle")}</div>
        <div className="mt-0.5 text-[10px] text-indigo-300/50">{t("artifactHint")}</div>
      </div>
      <svg className="h-4 w-4 flex-shrink-0 text-indigo-400/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  )
}

function DefaultCodeBlock({ code, language }: { code: string; language?: string }) {
  const lang = language?.replace(/^language-/, "") ?? ""
  return (
    <div className="my-3 overflow-hidden rounded-lg bg-[#1a1b26] shadow-lg ring-1 ring-white/[0.08]">
      {lang && (
        <div className="bg-[#15161e] px-4 py-2.5">
          <span className="text-[11px] font-medium text-white/30">{lang}</span>
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6 text-[#c0caf5]">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function buildMarkdownComponents(opts: MarkdownComponentsOpts) {
  const { citations, isMermaidStreaming, onArtifact, CodeBlock: ExternalCodeBlock } = opts
  const RenderCodeBlock = ExternalCodeBlock ?? DefaultCodeBlock

  return {
    p: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) => <p className="my-1.5">{processChildren(children, citations)}</p>,
    strong: ({ children }: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold text-foreground">{processChildren(children, citations)}</strong>,
    em: ({ children }: React.HTMLAttributes<HTMLElement>) => <em className="italic">{children}</em>,
    ul: ({ children }: React.HTMLAttributes<HTMLUListElement>) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
    ol: ({ children }: React.HTMLAttributes<HTMLOListElement>) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
    li: ({ children }: React.HTMLAttributes<HTMLLIElement>) => <li className="my-0.5 leading-6">{processChildren(children, citations)}</li>,
    h1: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="mb-3 mt-6 text-xl font-bold text-foreground">{processChildren(children, citations)}</h1>,
    h2: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="mb-2.5 mt-5 text-lg font-bold text-foreground">{processChildren(children, citations)}</h2>,
    h3: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="mb-2 mt-4 text-base font-semibold text-foreground">{processChildren(children, citations)}</h3>,
    h4: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-foreground/90">{processChildren(children, citations)}</h4>,
    h5: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h5 className="mb-1 mt-2.5 text-[13px] font-semibold text-foreground/80">{processChildren(children, citations)}</h5>,
    blockquote: ({ children }: React.HTMLAttributes<HTMLElement>) => <blockquote className="my-1.5 border-l-2 border-primary/40 pl-3 text-foreground/70">{processChildren(children, citations)}</blockquote>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code: ({ children, className, ...props }: any) => {
      const isInline = !("data-language" in props) && !className
      if (isInline) return <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-foreground/90">{children}</code>

      const text = String(children).replace(/\n$/, "")
      const lang = className ?? ""

      // Unified GenUI protocol dispatcher (priority)
      if (lang === "language-genui") {
        const parsed = safeParseJSON<GenUIPayload>(text)
        if (parsed?.type) return renderGenUIComponent(parsed, { onArtifact })

        // Fallback: artifact-html JSON often has escaping issues due to embedded HTML.
        // Try regex extraction before giving up.
        const artifactContent = extractArtifactHtml(text)
        if (artifactContent !== null) return <ArtifactCard content={artifactContent} onArtifact={onArtifact} />

        return <RenderCodeBlock code={text} language="json" />
      }

      // Backward-compatible: individual language-xxx blocks
      if (lang === "language-chart")       return <ChartBlock code={text} />
      if (lang === "language-table")       return <TableBlock code={text} />
      if (lang === "language-card")        return <CardBlock code={text} />
      if (lang === "language-formula")     return <FormulaBlock code={text} />
      if (lang === "language-paper-card")  return <PaperCardBlock code={text} />
      if (lang === "language-quiz")        return <QuizBlock code={text} />
      if (lang === "language-timeline")    return <TimelineBlock code={text} />
      if (lang === "language-steps")       return <StepsBlock code={text} />
      if (lang === "language-diff")        return <DiffBlock code={text} />
      if (lang === "language-matrix")      return <MatrixBlock code={text} />
      if (lang === "language-kanban")      return <KanbanBlock code={text} />
      if (lang === "language-graph")       return <GraphBlock code={text} />
      if (lang === "language-wordcloud")   return <WordCloudBlock code={text} />
      if (lang === "language-heatmap")     return <HeatmapBlock code={text} />

      // Artifact
      if (lang === "language-artifact-html") {
        return <ArtifactCard content={text} onArtifact={onArtifact} />
      }

      // Existing
      if (lang === "language-mermaid") return <MermaidBlock code={text} isStreaming={isMermaidStreaming} />

      return <RenderCodeBlock code={text} language={className} />
    },
    pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => <>{children}</>,
    table: ({ children }: React.HTMLAttributes<HTMLTableElement>) => (
      <div className="my-3 overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="bg-white/[0.04]">{children}</thead>,
    tbody: ({ children }: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y divide-white/[0.06]">{children}</tbody>,
    tr: ({ children }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className="transition-colors hover:bg-white/[0.02]">{children}</tr>,
    th: ({ children }: React.HTMLAttributes<HTMLTableCellElement>) => <th className="px-3 py-2 text-left text-xs font-semibold text-foreground/70">{children}</th>,
    td: ({ children }: React.HTMLAttributes<HTMLTableCellElement>) => <td className="px-3 py-2 text-foreground/80">{children}</td>,
    a: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} className="text-primary underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer">{children}</a>,
  }
}
