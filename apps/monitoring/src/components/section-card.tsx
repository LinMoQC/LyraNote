import { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function SectionCard({
  title,
  description,
  children,
  className,
  bodyClassName,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border border-white/[0.05] bg-card shadow-panel",
        "before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] before:from-white/[0.03] before:to-transparent",
        className,
      )}
    >
      <div className="border-b border-border/40 bg-white/[0.01] px-5 py-4 backdrop-blur-sm relative">
        {/* Subtle highlight line at the very top edge inside the card */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted/70">{description}</p>
        ) : null}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  )
}
