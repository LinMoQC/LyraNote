import { cn } from "@/lib/utils"

interface StatusConfig {
  bg: string
  text: string
  dot: string
  pulse: boolean
}

const statusMap: Record<string, StatusConfig> = {
  healthy: { bg: "bg-success/10 text-success ring-1 ring-inset ring-success/20", text: "text-success", dot: "bg-success shadow-glow-success", pulse: false },
  success: { bg: "bg-success/10 text-success ring-1 ring-inset ring-success/20", text: "text-success", dot: "bg-success shadow-glow-success", pulse: false },
  done: { bg: "bg-success/10 text-success ring-1 ring-inset ring-success/20", text: "text-success", dot: "bg-success shadow-glow-success", pulse: false },
  succeeded: { bg: "bg-success/10 text-success ring-1 ring-inset ring-success/20", text: "text-success", dot: "bg-success shadow-glow-success", pulse: false },
  running: { bg: "bg-accent/10 text-accent ring-1 ring-inset ring-accent/20", text: "text-accent", dot: "bg-accent shadow-glow-accent", pulse: true },
  cancelled: { bg: "bg-zinc-800 text-zinc-300 ring-1 ring-inset ring-zinc-700", text: "text-zinc-300", dot: "bg-zinc-400", pulse: false },
  stale: { bg: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/20", text: "text-warning", dot: "bg-warning shadow-glow-warning", pulse: false },
  stuck: { bg: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/20", text: "text-warning", dot: "bg-warning shadow-glow-warning", pulse: false },
  down: { bg: "bg-danger/10 text-danger ring-1 ring-inset ring-danger/20", text: "text-danger", dot: "bg-danger shadow-glow-danger", pulse: false },
  error: { bg: "bg-danger/10 text-danger ring-1 ring-inset ring-danger/20", text: "text-danger", dot: "bg-danger shadow-glow-danger", pulse: false },
  failed: { bg: "bg-danger/10 text-danger ring-1 ring-inset ring-danger/20", text: "text-danger", dot: "bg-danger shadow-glow-danger", pulse: false },
}

const fallback: StatusConfig = {
  bg: "bg-zinc-800 ring-1 ring-inset ring-zinc-700",
  text: "text-zinc-300",
  dot: "bg-zinc-400",
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
