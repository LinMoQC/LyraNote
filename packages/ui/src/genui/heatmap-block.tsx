"use client"

import { useTranslations } from "next-intl"

import { memo, useMemo } from "react"
import dynamic from "next/dynamic"
import { safeParseJSON } from "./utils"

const ResponsiveCalendar = dynamic(
  () => import("@nivo/calendar").then((m) => m.ResponsiveCalendar),
  { ssr: false }
)

interface HeatmapData {
  title?: string
  data: Array<{ date: string; value: number }>
  colorScheme?: string
}

const COLOR_SCHEMES: Record<string, string[]> = {
  purple: ["#2d1b69", "#4c1d95", "#6d28d9", "#8b5cf6", "#a78bfa"],
  green:  ["#052e16", "#14532d", "#166534", "#22c55e", "#4ade80"],
  blue:   ["#0c1a3a", "#1e3a5f", "#1d4ed8", "#3b82f6", "#60a5fa"],
  amber:  ["#422006", "#78350f", "#b45309", "#f59e0b", "#fbbf24"],
}

function HeatmapBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui")
  if (isStreaming) {
    return (
      <div className="my-3 flex h-40 items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground/60">
        {t("heatmapStreaming")}
      </div>
    )
  }

  const data = safeParseJSON<HeatmapData>(code)
  if (!data || !Array.isArray(data.data)) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const calendarData = useMemo(() => data.data.map((d) => ({ day: d.date, value: d.value })), [data.data])
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [minDate, maxDate] = useMemo(() => {
    const dates = data.data.map((d) => d.date).sort()
    return [dates[0] ?? "2025-01-01", dates[dates.length - 1] ?? "2025-12-31"]
  }, [data.data])

  const colors = COLOR_SCHEMES[data.colorScheme ?? "purple"] ?? COLOR_SCHEMES.purple

  return (
    <div className="my-3 rounded-xl border border-border/40 bg-muted/10 p-4">
      {data.title && <p className="mb-2 text-sm font-medium text-foreground/80">{data.title}</p>}
      <div style={{ height: 180 }}>
        <ResponsiveCalendar
          data={calendarData}
          from={minDate}
          to={maxDate}
          emptyColor="#1e1e2e"
          colors={colors}
          yearSpacing={40}
          monthBorderWidth={2}
          monthBorderColor="#1e1e2e"
          dayBorderWidth={1}
          dayBorderColor="#1e1e2e"
          theme={{
            labels: { text: { fill: "rgba(255,255,255,0.4)", fontSize: 10 } },
            tooltip: { container: { background: "#1e1e2e", borderRadius: 8, fontSize: 12 } },
          }}
        />
      </div>
    </div>
  )
}

export const HeatmapBlock = memo(HeatmapBlockInner)
