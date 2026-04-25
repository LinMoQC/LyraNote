"use client"

import Link from "next/link"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { CorrelationFilterPanel } from "@/components/correlation-filter-panel"
import { FilterBar } from "@/components/filter-bar"
import { ProtectedView } from "@/components/protected-view"
import { SectionCard } from "@/components/section-card"
import { StatusBadge } from "@/components/status-badge"
import { TRACES_ROUTE } from "@/lib/constants"
import { UnauthorizedError } from "@/lib/http-client"
import { formatDateTime, formatDuration } from "@/lib/utils"
import { getTraces } from "@/services/monitoring-service"

export function TracesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const window = searchParams.get("window") ?? "24h"
  const type = searchParams.get("type") ?? undefined
  const status = searchParams.get("status") ?? undefined
  const cursor = searchParams.get("cursor") ?? undefined
  const correlationParams = {
    user_id: searchParams.get("user_id") ?? undefined,
    conversation_id: searchParams.get("conversation_id") ?? undefined,
    generation_id: searchParams.get("generation_id") ?? undefined,
    task_id: searchParams.get("task_id") ?? undefined,
    task_run_id: searchParams.get("task_run_id") ?? undefined,
    notebook_id: searchParams.get("notebook_id") ?? undefined,
  }

  // Keep a stack of previous cursors so we can go back
  const prevCursorsRaw = searchParams.get("prev") ?? ""
  const prevCursors = prevCursorsRaw ? prevCursorsRaw.split(",") : []

  const PAGE_SIZE = 12

  const tracesQuery = useQuery({
    queryKey: ["monitoring", "traces", window, type, status, cursor, PAGE_SIZE, correlationParams],
    queryFn: () => getTraces({ window, type, status, cursor, limit: PAGE_SIZE, ...correlationParams }),
  })

  function buildUrl(params: Record<string, string | undefined>) {
    const next = new URLSearchParams()
    const merged = {
      window,
      type: type ?? "",
      status: status ?? "",
      cursor: cursor ?? "",
      prev: prevCursorsRaw,
      user_id: correlationParams.user_id ?? "",
      conversation_id: correlationParams.conversation_id ?? "",
      generation_id: correlationParams.generation_id ?? "",
      task_id: correlationParams.task_id ?? "",
      task_run_id: correlationParams.task_run_id ?? "",
      notebook_id: correlationParams.notebook_id ?? "",
      ...params,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (v) next.set(k, v)
    }
    return `${pathname}${next.toString() ? `?${next.toString()}` : ""}`
  }

  function goNext() {
    const nextCursor = tracesQuery.data?.next_cursor
    if (!nextCursor) return
    const newPrev = cursor ? [...prevCursors, cursor].join(",") : prevCursors.join(",")
    router.push(buildUrl({ cursor: nextCursor, prev: newPrev }))
  }

  function goPrev() {
    const newPrev = [...prevCursors]
    const prevCursor = newPrev.pop()
    router.push(buildUrl({ cursor: prevCursor ?? "", prev: newPrev.join(",") }))
  }

  const hasPrev = prevCursors.length > 0
  const hasNext = !!tracesQuery.data?.next_cursor
  const total = tracesQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(prevCursors.length + 1, totalPages)

  return (
    <ProtectedView unauthorized={tracesQuery.error instanceof UnauthorizedError}>
      <div className="flex h-full min-h-0 flex-col gap-5">
        <FilterBar
          fields={[
            {
              key: "window",
              label: "时间窗口",
              options: [
                { label: "24 小时", value: "24h" },
                { label: "48 小时", value: "48h" },
                { label: "7 天", value: "7d" },
              ],
            },
            {
              key: "type",
              label: "链路类型",
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
              label: "状态",
              options: [
                { label: "全部", value: "" },
                { label: "succeeded", value: "succeeded" },
                { label: "running", value: "running" },
                { label: "failed", value: "failed" },
                { label: "cancelled", value: "cancelled" },
              ],
            },
          ]}
        />
        <CorrelationFilterPanel resetKeys={["cursor", "prev"]} />

        <SectionCard
          title="链路列表"
          description="按 trace 聚合的顶层运行记录（仅长链路，不包含普通 API / CRUD）。"
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="flex min-h-0 flex-1 flex-col p-0"
        >
          {tracesQuery.isLoading ? (
            <p className="px-5 py-5 text-sm text-muted/60">正在加载链路...</p>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-white/[0.04]">
                    <tr>
                      <th className="px-5 py-3 text-[10px] uppercase tracking-[0.15em] font-medium text-muted/50">Trace</th>
                      <th className="px-5 py-3 text-[10px] uppercase tracking-[0.15em] font-medium text-muted/50">Type</th>
                      <th className="px-5 py-3 text-[10px] uppercase tracking-[0.15em] font-medium text-muted/50">Time</th>
                      <th className="px-5 py-3 text-[10px] uppercase tracking-[0.15em] font-medium text-muted/50">Duration</th>
                      <th className="px-5 py-3 text-[10px] uppercase tracking-[0.15em] font-medium text-muted/50">Path</th>
                      <th className="px-5 py-3 text-[10px] uppercase tracking-[0.15em] font-medium text-muted/50 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.02]">
                    {(tracesQuery.data?.items ?? []).map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => router.push(`${TRACES_ROUTE}/${item.trace_id}`)}
                        className="group cursor-pointer transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-foreground">{item.name}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted/40">{item.trace_id}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="rounded bg-white/5 border border-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted/80">
                            {item.run_type}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 tabular text-xs text-muted/80">{formatDateTime(item.started_at)}</td>
                        <td className="px-5 py-3.5 tabular text-xs text-muted/80">{formatDuration(item.duration_ms)}</td>
                        <td className="px-5 py-3.5 text-xs text-muted/50 max-w-[200px] truncate">
                          {item.metadata?.path ? String(item.metadata.path) : "内部任务"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    ))}
                    {!tracesQuery.data?.items.length ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-sm text-muted/50">当前筛选条件下没有链路记录。</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {/* Pagination — pinned to the card bottom */}
              {(tracesQuery.data?.items.length ?? 0) > 0 && (
                <div className="flex shrink-0 items-center justify-between border-t border-border/30 px-5 py-4">
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={!hasPrev}
                    className="flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft size={14} />
                    上一页
                  </button>
                  <span className="text-xs text-muted/50">
                    第 {currentPage} / {totalPages} 页 · 每页 {PAGE_SIZE} 条 · 共 {total} 条
                  </span>
                  <button
                    type="button"
                    onClick={goNext}
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
