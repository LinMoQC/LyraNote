import { cn } from "@/lib/utils"

interface StatusConfig {
  bg: string
  text: string
  dot: string
  pulse: boolean
}

const statusMap: Record<string, StatusConfig> = {
  healthy: { bg: "bg-success/10", text: "text-success", dot: "bg-success", pulse: false },
  success: { bg: "bg-success/10", text: "text-success", dot: "bg-success", pulse: false },
  done: { bg: "bg-success/10", text: "text-success", dot: "bg-success", pulse: false },
  running: { bg: "bg-accent/10", text: "text-accent", dot: "bg-accent", pulse: true },
  stale: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning", pulse: false },
  stuck: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning", pulse: false },
  down: { bg: "bg-danger/10", text: "text-danger", dot: "bg-danger", pulse: false },
  error: { bg: "bg-danger/10", text: "text-danger", dot: "bg-danger", pulse: false },
  failed: { bg: "bg-danger/10", text: "text-danger", dot: "bg-danger", pulse: false },
}

const fallback: StatusConfig = {
  bg: "bg-white/8",
  text: "text-foreground",
  dot: "bg-muted",
  pulse: false,
}

export function StatusBadge({ status }: { status: string }) {
  const config = statusMap[status] ?? fallback

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
        config.bg,
        config.text,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          config.dot,
          config.pulse && "animate-status-pulse",
        )}
      />
      {status}
    </span>
  )
}
