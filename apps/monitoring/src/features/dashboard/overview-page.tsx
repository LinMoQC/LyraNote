"use client"

import { CheckCircle } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { OverviewCards } from "@/components/overview-cards"
import { ProtectedView } from "@/components/protected-view"
import { SectionCard } from "@/components/section-card"
import { StatusBadge } from "@/components/status-badge"
import { formatDateTime } from "@/lib/utils"
import { UnauthorizedError } from "@/lib/http-client"
import { getFailures, getOverview } from "@/services/monitoring-service"

const statusDotMap: Record<string, string> = {
  healthy: "bg-success",
  success: "bg-success",
  done: "bg-success",
  succeeded: "bg-success",
  running: "bg-accent",
  stale: "bg-warning",
  stuck: "bg-warning",
  down: "bg-danger",
  error: "bg-danger",
  failed: "bg-danger",
}

export function OverviewPage() {
  const overviewQuery = useQuery({
    queryKey: ["monitoring", "overview"],
    queryFn: () => getOverview(),
  })
  const failuresQuery = useQuery({
    queryKey: ["monitoring", "failures", "recent"],
    queryFn: () => getFailures({ window: "24h" }),
  })

  const unauthorized =
    overviewQuery.error instanceof UnauthorizedError ||
    failuresQuery.error instanceof UnauthorizedError

  const failures = (failuresQuery.data?.items ?? []).slice(0, 6)
  const hasFailures = failures.length > 0

  return (
    <ProtectedView unauthorized={unauthorized}>
      {overviewQuery.data ? <OverviewCards overview={overviewQuery.data} /> : null}

      <SectionCard title="最近故障" description="聚合聊天、研究、定时任务和来源导入失败。">
        {failuresQuery.isLoading ? (
          <p className="text-sm text-muted/60">正在加载故障列表...</p>
        ) : hasFailures ? (
          <div className="space-y-2">
            {failures.map((item) => (
              <article
                key={`${item.kind}-${item.id}`}
                className="flex items-start gap-3 rounded-lg border border-border/40 bg-card/30 px-4 py-3.5 transition-colors hover:bg-card/50"
              >
                {/* Status dot */}
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDotMap[item.status] ?? "bg-muted"}`}
                />

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.title || item.kind}
                  </p>
                  <p className="mt-0.5 text-xs text-muted/80 line-clamp-1">
                    {item.message || "无额外错误信息"}
                  </p>
                  <p className="mt-1.5 text-[11px] text-muted/50">
                    {formatDateTime(item.created_at)}
                  </p>
                </div>

                {/* Badge */}
                <StatusBadge status={item.status} />
              </article>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle size={28} className="text-success/60" />
            <p className="text-sm font-medium text-foreground">运行正常</p>
            <p className="text-xs text-muted/60">最近 24 小时没有记录到失败事件。</p>
          </div>
        )}
      </SectionCard>
    </ProtectedView>
  )
}
