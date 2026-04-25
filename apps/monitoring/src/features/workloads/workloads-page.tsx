"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, ExternalLink, Layers, Zap, Clock, Database } from "lucide-react"

import { CorrelationFilterPanel } from "@/components/correlation-filter-panel"
import { FilterBar } from "@/components/filter-bar"
import { MetricCard } from "@/components/metric-card"
import { ProtectedView } from "@/components/protected-view"
import { SectionCard } from "@/components/section-card"
import { StatusBadge } from "@/components/status-badge"
import { TRACES_ROUTE } from "@/lib/constants"
import { UnauthorizedError } from "@/lib/http-client"
import { formatDateTime } from "@/lib/utils"
import { getWorkloads } from "@/services/monitoring-service"

const kindIconMap: Record<string, ReactNode> = {
  chat_generation: <Zap size={14} />,
  research_task: <Layers size={14} />,
  scheduled_task_run: <Clock size={14} />,
  source_ingest: <Database size={14} />,
}

const kindColorMap: Record<string, "teal" | "blue" | "yellow" | "green"> = {
  chat_generation: "teal",
  research_task: "blue",
  scheduled_task_run: "yellow",
  source_ingest: "green",
}

const PAGE_SIZE = 12

export function WorkloadsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const kind = searchParams.get("kind") ?? undefined
  const status = searchParams.get("status") ?? undefined
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const offset = (page - 1) * PAGE_SIZE
  const correlationParams = {
    user_id: searchParams.get("user_id") ?? undefined,
    conversation_id: searchParams.get("conversation_id") ?? undefined,
    generation_id: searchParams.get("generation_id") ?? undefined,
    task_id: searchParams.get("task_id") ?? undefined,
    task_run_id: searchParams.get("task_run_id") ?? undefined,
    notebook_id: searchParams.get("notebook_id") ?? undefined,
  }

  const workloadsQuery = useQuery({
    queryKey: ["monitoring", "workloads", kind, status, offset, PAGE_SIZE, correlationParams],
    queryFn: () => getWorkloads({ kind, status, offset, limit: PAGE_SIZE, ...correlationParams }),
  })

  const items = workloadsQuery.data?.items ?? []
  const total = workloadsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = page < totalPages

  function goToPage(p: number) {
    const next = new URLSearchParams(searchParams.toString())
    if (p === 1) {
      next.delete("page")
    } else {
      next.set("page", String(p))
    }
    router.push(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`)
  }

  return (
    <ProtectedView unauthorized={workloadsQuery.error instanceof UnauthorizedError}>
      <div className="flex h-full min-h-0 flex-col gap-5">
        <FilterBar
          fields={[
            {
              key: "kind",
              label: "任务类型",
              options: [
                { label: "全部", value: "" },
                { label: "聊天生成", value: "chat_generation" },
                { label: "研究任务", value: "research_task" },
                { label: "定时任务", value: "scheduled_task_run" },
                { label: "来源导入", value: "source_ingest" },
              ],
            },
            {
              key: "status",
              label: "任务状态",
              options: [
                { label: "全部", value: "" },
                { label: "running", value: "running" },
                { label: "stuck", value: "stuck" },
                { label: "succeeded", value: "succeeded" },
                { label: "failed", value: "failed" },
                { label: "cancelled", value: "cancelled" },
              ],
            },
          ]}
        />
        <CorrelationFilterPanel resetKeys={["page"]} />

        {workloadsQuery.data?.summary.length ? (
          <div className="grid shrink-0 gap-4 md:grid-cols-3">
            {workloadsQuery.data.summary.map((item) => (
              <MetricCard
                key={item.kind}
                label={item.kind}
                value={String(item.running_count)}
                hint={`stuck ${item.stuck_count} / failed ${item.failed_count}`}
                color={kindColorMap[item.kind] ?? "teal"}
                icon={kindIconMap[item.kind] ?? <Layers size={14} />}
              />
            ))}
          </div>
        ) : null}

        <SectionCard
          title="运行明细"
          description="只展示最近一批任务和生成记录。"
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="flex min-h-0 flex-1 flex-col p-0"
        >
          {workloadsQuery.isLoading ? (
            <p className="px-5 py-5 text-sm text-muted/60">正在加载任务...</p>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-2">
                  {items.map((item) => (
                    <article
                      key={`${item.kind}-${item.id}`}
                      className="flex items-center gap-4 rounded-lg border border-border/40 bg-card/30 px-4 py-3 transition-colors hover:bg-card/50"
                    >
                      {/* Left content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {item.title || item.kind}
                          </p>
                          <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted/60">
                            {item.kind}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-3">
                          <p className="text-xs text-muted/60">{item.message || "运行中或已完成"}</p>
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-xs text-muted/60">
                        <span className="tabular hidden sm:block">{formatDateTime(item.started_at)}</span>
                        {item.trace_available && item.trace_id ? (
                          <Link
                            href={`${TRACES_ROUTE}/${item.trace_id}`}
                            className="flex items-center gap-1 text-accent/70 transition-colors hover:text-accent"
                          >
                            <ExternalLink size={12} />
                            Trace
                          </Link>
                        ) : (
                          <span className="rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[11px] text-warning/80">
                            {item.trace_missing_reason === "legacy_source_ingest_without_trace" ? "历史数据无 Trace" : "暂无 Trace"}
                          </span>
                        )}
                        <StatusBadge status={item.status} />
                      </div>
                    </article>
                  ))}

                  {!items.length ? (
                    <p className="py-8 text-center text-sm text-muted/60">没有符合条件的任务记录。</p>
                  ) : null}
                </div>
              </div>

              {total > 0 && (
                <div className="flex shrink-0 items-center justify-between border-t border-border/30 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => goToPage(page - 1)}
                    disabled={!hasPrev}
                    className="flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft size={14} />
                    上一页
                  </button>
                  <span className="text-xs text-muted/50">
                    第 {page} / {totalPages} 页 · 每页 {PAGE_SIZE} 条 · 共 {total} 条
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(page + 1)}
                    disabled={!hasNext}
                    className="flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    下一页
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>
    </ProtectedView>
  )
}
