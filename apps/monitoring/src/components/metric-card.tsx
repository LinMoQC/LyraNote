import { ReactNode } from "react"

import { cn } from "@/lib/utils"

type MetricCardColor = "teal" | "blue" | "yellow" | "green"

const colorMap: Record<
  MetricCardColor,
  { bar: string; iconBg: string; iconText: string }
> = {
  teal: {
    bar: "bg-accent/70",
    iconBg: "bg-accent/10",
    iconText: "text-accent",
  },
  blue: {
    bar: "bg-blue-400/70",
    iconBg: "bg-blue-400/10",
    iconText: "text-blue-400",
  },
  yellow: {
    bar: "bg-warning/70",
    iconBg: "bg-warning/10",
    iconText: "text-warning",
  },
  green: {
    bar: "bg-success/70",
    iconBg: "bg-success/10",
    iconText: "text-success",
  },
}

export function MetricCard({
  label,
  value,
  hint,
  color = "teal",
  icon,
}: {
  label: string
  value: string
  hint?: string
  color?: MetricCardColor
  icon?: ReactNode
}) {
  const palette = colorMap[color]

  return (
    <section className="relative overflow-hidden rounded-xl border border-border/60 bg-card/50 p-5 backdrop-blur">
      {/* Colored top accent line */}
      <div className={cn("absolute inset-x-0 top-0 h-[2px]", palette.bar)} />

      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted/70">{label}</p>
        {icon ? (
          <div className={cn("rounded-lg p-1.5", palette.iconBg, palette.iconText)}>
            {icon}
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-[2.25rem] font-bold leading-none tabular text-foreground">
        {value}
      </p>

      {hint ? (
        <p className="mt-2 text-xs text-muted/80">{hint}</p>
      ) : null}
    </section>
  )
}
