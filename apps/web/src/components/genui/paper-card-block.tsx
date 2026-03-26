"use client"

import { useTranslations } from "next-intl"

import { memo } from "react"
import { ExternalLink } from "lucide-react"
import { safeParseJSON } from "./utils"

interface PaperCardData {
  title: string
  authors?: string[]
  venue?: string
  year?: string
  citations?: number
  doi?: string
  tags?: string[]
  abstract?: string
}

function PaperCardBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui")
  if (isStreaming) {
    return (
      <div className="my-3 flex h-32 items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground/60">
        {t("paperCardStreaming")}
      </div>
    )
  }

  const data = safeParseJSON<PaperCardData>(code)
  if (!data) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  return (
    <div className="my-3 rounded-xl border border-border/40 bg-muted/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold leading-snug text-foreground/90">{data.title}</h4>
        {data.citations != null && (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium tabular-nums text-amber-400">
            {data.citations} citations
          </span>
        )}
      </div>

      {data.authors && data.authors.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground/60">
          {data.authors.join(", ")}
        </p>
      )}

      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground/50">
        {data.venue && <span>{data.venue}</span>}
        {data.venue && data.year && <span>·</span>}
        {data.year && <span>{data.year}</span>}
      </div>

      {data.abstract && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-foreground/70">{data.abstract}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {data.tags?.map((tag, i) => (
          <span key={i} className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
            {tag}
          </span>
        ))}
        <div className="flex-1" />
        {data.doi && (
          <a
            href={data.doi}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[10px] text-muted-foreground/60 transition-colors hover:bg-white/[0.1] hover:text-foreground/80"
          >
            <ExternalLink size={10} />
            DOI
          </a>
        )}
      </div>
    </div>
  )
}

export const PaperCardBlock = memo(PaperCardBlockInner)
