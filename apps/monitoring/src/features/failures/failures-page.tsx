"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink, CheckCircle } from "lucide-react"

import { CorrelationFilterPanel } from "@/components/correlation-filter-panel"
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
  const correlationParams = {
    user_id: searchParams.get("user_id") ?? undefined,
    conversation_id: searchParams.get("conversation_id") ?? undefined,
    generation_id: searchParams.get("generation_id") ?? undefined,
    task_id: searchParams.get("task_id") ?? undefined,
    task_run_id: searchParams.get("task_run_id") ?? undefined,
    notebook_id: searchParams.get("notebook_id") ?? undefined,
  }

  const failuresQuery = useQuery({
    queryKey: ["monitoring", "failures", window, kind, correlationParams],
    queryFn: () => getFailures({ window, kind, ...correlationParams }),
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
      <CorrelationFilterPanel />

      <SectionCard title="失败事件" description="统一查看聊天、研究、定时任务和来源导入失败。" className="flex min-h-0 flex-1 flex-col" bodyClassName="flex min-h-0 flex-1 flex-col p-0">
        {failuresQuery.isLoading ? (
          <p className="text-sm text-muted/60">正在加载故障列表...</p>
        ) : hasItems ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-white/[0.04]">
                <tr>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-[0.15em] font-medium text-muted/50 w-2/3">Event & Message</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-[0.15em] font-medium text-muted/50 whitespace-nowrap">Time</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-[0.15em] font-medium text-muted/50 whitespace-nowrap">Trace</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-[0.15em] font-medium text-muted/50 text-right whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {items.map((item) => (
                  <tr
                    key={`${item.kind}-${item.id}`}
                    className="group transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-start gap-3">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDotMap[item.status] ?? "bg-muted"} shadow-[0_0_8px_currentColor]`} />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.title || item.kind}</p>
                          <p className="mt-1 text-xs text-muted/70 font-mono break-all line-clamp-3">{item.message || "无错误信息"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top tabular text-xs text-muted/80 whitespace-nowrap">
                      {formatDateTime(item.created_at)}
                    </td>
                    <td className="px-5 py-4 align-top whitespace-nowrap">
                      {item.trace_available && item.trace_id ? (
                        <Link
                          href={`${TRACES_ROUTE}/${item.trace_id}`}
                          className="flex items-center gap-1 text-[11px] text-accent/70 transition-colors hover:text-accent"
                        >
                          <ExternalLink size={11} />
                          查看 Trace
                        </Link>
                      ) : (
                        <span className="rounded bg-white/5 border border-warning/20 px-1.5 py-0.5 text-[10px] text-warning/80">
                          {item.trace_missing_reason === "legacy_source_ingest_without_trace" ? "历史无 Trace" : "暂无 Trace"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top text-right whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
