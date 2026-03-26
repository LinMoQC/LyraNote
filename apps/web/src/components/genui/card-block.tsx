"use client"

import { useTranslations } from "next-intl"

import { memo } from "react"
import { safeParseJSON } from "./utils"

interface CardItem {
  label: string
  value: string
}

interface CardData {
  title: string
  subtitle?: string
  items: CardItem[]
}

const ACCENT_COLORS = [
  { dot: "bg-indigo-400", pill: "border-indigo-500/25 bg-indigo-500/10 text-indigo-300" },
  { dot: "bg-emerald-400", pill: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" },
  { dot: "bg-amber-400", pill: "border-amber-500/25 bg-amber-500/10 text-amber-300" },
  { dot: "bg-rose-400", pill: "border-rose-500/25 bg-rose-500/10 text-rose-300" },
  { dot: "bg-cyan-400", pill: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300" },
  { dot: "bg-purple-400", pill: "border-purple-500/25 bg-purple-500/10 text-purple-300" },
]

function SingleCard({ card }: { card: CardData }) {
  return (
    <div className="flex-1 rounded-xl border border-border/30 bg-muted/20 p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
          <svg className="h-3.5 w-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold leading-tight text-foreground/90">{card.title}</h4>
          {card.subtitle && (
            <p className="mt-0.5 text-[10px] text-muted-foreground/50">{card.subtitle}</p>
          )}
        </div>
      </div>

      <div className="mt-3 divide-y divide-border/20">
        {card.items.map((item, i) => {
          const accent = ACCENT_COLORS[i % ACCENT_COLORS.length]
          return (
            <div key={i} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
              <span className={`mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full ${accent.dot}`} />
              <div className="min-w-0 flex-1">
                <span className={`inline-block rounded-full border px-1.5 py-px text-[9px] font-medium leading-normal ${accent.pill}`}>
                  {item.label}
                </span>
                <p className="mt-0.5 text-xs leading-relaxed text-foreground/75">{item.value}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CardBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui")
  if (isStreaming) {
    return (
      <div className="my-3 flex h-24 items-center justify-center rounded-xl border border-border/30 bg-muted/20 text-xs text-muted-foreground/60">
        {t("cardStreaming")}
      </div>
    )
  }

  const parsed = safeParseJSON<CardData | CardData[]>(code)
  if (!parsed) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>
  const cards = Array.isArray(parsed) ? parsed : [parsed]
  if (cards.length === 0 || !cards[0]?.items) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  return (
    <div className={`my-3 grid gap-3 ${cards.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
      {cards.map((card, i) => <SingleCard key={i} card={card} />)}
    </div>
  )
}

export const CardBlock = memo(CardBlockInner)
