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
        "overflow-hidden rounded-xl border border-border/50 bg-card/40 backdrop-blur",
        className,
      )}
    >
      <div className="border-b border-border/40 px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted/70">{description}</p>
        ) : null}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  )
}
