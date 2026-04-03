"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink, CheckCircle } from "lucide-react"

import { FilterBar } from "@/components/filter-bar"
import { ProtectedView } from "@/components/protected-view"
import { SectionCard } from "@/components/section-card"
import { StatusBadge } from "@/components/status-badge"
import { TRACES_ROUTE } from "@/lib/constants"
import { UnauthorizedError } from "@/lib/http-client"
import { formatDateTime } from "@/lib/utils"
import { getFailures } from "@/services/monitoring-service"

const statusDotMap: Record<string, string> = {
  healthy: "bg-success",
  success: "bg-success",
  done: "bg-success",
  running: "bg-accent",
  stale: "bg-warning",
  stuck: "bg-warning",
  down: "bg-danger",
  error: "bg-danger",
  failed: "bg-danger",
}

export function FailuresPage() {
  const searchParams = useSearchParams()
  const window = searchParams.get("window") ?? "24h"
  const kind = searchParams.get("kind") ?? undefined

  const failuresQuery = useQuery({
    queryKey: ["monitoring", "failures", window, kind],
    queryFn: () => getFailures(window, kind),
  })

  const items = failuresQuery.data?.items ?? []
  const hasItems = items.length > 0

  return (
    <ProtectedView unauthorized={failuresQuery.error instanceof UnauthorizedError}>
      <FilterBar
        fields={[
          {
            key: "window",
            label: "时间窗口",
            options: [
              { label: "24 小时", value: "24h" },
              { label: "72 小时", value: "72h" },
              { label: "7 天", value: "7d" },
            ],
          },
          {
            key: "kind",
            label: "失败类型",
            options: [
              { label: "全部", value: "" },
              { label: "聊天生成", value: "chat_generation" },
              { label: "研究任务", value: "research_task" },
              { label: "定时任务", value: "scheduled_task_run" },
              { label: "来源导入", value: "source_ingest" },
            ],
          },
        ]}
      />

      <SectionCard title="失败事件" description="统一查看聊天、研究、定时任务和来源导入失败。">
        {failuresQuery.isLoading ? (
          <p className="text-sm text-muted/60">正在加载故障列表...</p>
        ) : hasItems ? (
          <div className="space-y-2">
            {items.map((item) => (
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
                  <p className="mt-0.5 text-xs text-muted/80 line-clamp-2">
                    {item.message || "无错误信息"}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <p className="text-[11px] text-muted/50">{formatDateTime(item.created_at)}</p>
                    {item.trace_id ? (
                      <Link
                        href={`${TRACES_ROUTE}/${item.trace_id}`}
                        className="flex items-center gap-1 text-[11px] text-accent/70 transition-colors hover:text-accent"
                      >
                        <ExternalLink size={11} />
                        查看 Trace
                      </Link>
                    ) : null}
                  </div>
                </div>

                {/* Badge */}
                <StatusBadge status={item.status} />
              </article>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle size={28} className="text-success/60" />
            <p className="text-sm font-medium text-foreground">没有失败事件</p>
            <p className="text-xs text-muted/60">当前时间窗口内一切正常。</p>
          </div>
        )}
      </SectionCard>
    </ProtectedView>
  )
}
