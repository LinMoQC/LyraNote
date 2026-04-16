"use client"

import { useTranslations } from "next-intl"

import { memo, useMemo } from "react"
import { cn } from "@/lib/utils"
import { safeParseJSON } from "./utils"

interface TimelineEvent {
  year: string
  title: string
  desc?: string
  highlight?: boolean
}

interface RawTimelineData {
  title?: string
  events?: Record<string, unknown>[]
  items?: Record<string, unknown>[]
}

function normalizeEvent(raw: Record<string, unknown>): TimelineEvent {
  return {
    year:      String(raw.year ?? raw.date ?? ""),
    title:     String(raw.title ?? raw.event ?? raw.name ?? ""),
    desc:      raw.desc != null ? String(raw.desc) : raw.description != null ? String(raw.description) : undefined,
    highlight: Boolean(raw.highlight),
  }
}

function TimelineBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui")
  if (isStreaming) {
    return (
      <div className="my-3 flex h-24 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs text-white/40">
        {t("timelineStreaming")}
      </div>
    )
  }

  const raw = safeParseJSON<RawTimelineData>(code)
  const eventArr = raw?.events ?? raw?.items
  if (!raw || !Array.isArray(eventArr)) return <pre className="my-2 overflow-x-auto rounded-xl bg-white/[0.06] p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const events = useMemo(() => eventArr.map(normalizeEvent), [eventArr])

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-muted/15 to-muted/5 p-5">
      {raw.title && (
        <h4 className="mb-5 flex items-center gap-2 text-sm font-semibold text-white/90">
          <span className="inline-block h-3 w-0.5 rounded-full bg-indigo-500" />
          {raw.title}
        </h4>
      )}
      <div className="ml-[18px]">
        {events.map((event, i) => {
          const isLast = i === events.length - 1
          return (
            <div key={i} className="flex gap-4">
              {/* Dot + connector line column */}
              <div className="flex shrink-0 flex-col items-center">
                <div className={cn(
                  "relative z-10 h-3 w-3 shrink-0 rounded-full ring-[3px]",
                  event.highlight
                    ? "bg-indigo-400 ring-indigo-500/25 shadow-[0_0_10px_3px_rgba(99,102,241,0.35)]"
                    : "bg-white/40 ring-white/[0.08]"
                )} />
                {!isLast && (
                  <div className="w-px flex-1 bg-gradient-to-b from-indigo-500/30 to-indigo-400/10" />
                )}
              </div>

              {/* Content card */}
              <div className={cn(
                "-mt-0.5 mb-2 min-w-0 flex-1 rounded-lg px-3.5 py-2.5 transition-colors",
                event.highlight
                  ? "bg-indigo-500/[0.08] ring-1 ring-indigo-500/20"
                  : "hover:bg-white/[0.03]"
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    event.highlight
                      ? "bg-indigo-500/20 text-indigo-300"
                      : "bg-white/[0.06] text-white/35"
                  )}>
                    {event.year}
                  </span>
                  <h5 className={cn(
                    "text-[13px] font-semibold leading-snug",
                    event.highlight ? "text-indigo-200" : "text-white/80"
                  )}>
                    {event.title}
                  </h5>
                </div>
                {event.desc && (
                  <p className="mt-1.5 text-xs leading-relaxed text-white/40">{event.desc}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const TimelineBlock = memo(TimelineBlockInner)
