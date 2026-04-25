"use client"

import { ReactNode, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type MetricCardColor = "teal" | "blue" | "yellow" | "green"

const colorMap: Record<
  MetricCardColor,
  { bar: string; iconBg: string; iconText: string; spotlight: string }
> = {
  teal: {
    bar: "bg-accent/70",
    iconBg: "bg-accent/10",
    iconText: "text-accent",
    spotlight: "rgba(20, 184, 166, 0.15)",
  },
  blue: {
    bar: "bg-blue-400/70",
    iconBg: "bg-blue-400/10",
    iconText: "text-blue-400",
    spotlight: "rgba(96, 165, 250, 0.15)",
  },
  yellow: {
    bar: "bg-warning/70",
    iconBg: "bg-warning/10",
    iconText: "text-warning",
    spotlight: "rgba(234, 179, 8, 0.15)",
  },
  green: {
    bar: "bg-success/70",
    iconBg: "bg-success/10",
    iconText: "text-success",
    spotlight: "rgba(34, 197, 94, 0.15)",
  },
}

export function MetricCard({
  label,
  value,
  hint,
  color = "teal",
  icon,
  delay = 0,
}: {
  label: string
  value: string
  hint?: string
  color?: MetricCardColor
  icon?: ReactNode
  delay?: number
}) {
  const palette = colorMap[color]
  const divRef = useRef<HTMLElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!divRef.current) return
    const rect = divRef.current.getBoundingClientRect()
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <section
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
      className="group relative overflow-hidden rounded-xl border border-white/[0.04] bg-card/60 p-4 shadow-sm backdrop-blur-md transition-all duration-500 hover:-translate-y-1 hover:border-white/10 hover:shadow-panel animate-in fade-in slide-in-from-bottom-4 duration-700"
    >
      {/* Interactive Spotlight */}
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, ${palette.spotlight}, transparent 40%)`,
        }}
      />
      
      {/* Colored top accent line */}
      <div className={cn("absolute inset-x-0 top-0 h-[2px] transition-opacity duration-300", palette.bar)} />

      {/* Hover glow for the accent line */}
      <div className={cn("absolute inset-x-0 top-0 h-[15px] blur-md opacity-0 transition-opacity duration-500 group-hover:opacity-40", palette.bar)} />

      <div className="relative z-10 flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted/70 transition-colors group-hover:text-muted/90">{label}</p>
        {icon ? (
          <div className={cn("rounded-lg p-1.5 transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_0_15px_currentColor]", palette.iconBg, palette.iconText)}>
            {icon}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 mt-3 flex items-baseline gap-2">
        <p className="text-2xl font-bold leading-none tabular text-foreground">
          {value}
        </p>
        {hint ? (
          <p className="text-[10px] text-muted/60">{hint}</p>
        ) : null}
      </div>
    </section>
  )
}
