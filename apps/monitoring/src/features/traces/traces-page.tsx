"use client"

import Link from "next/link"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight } from "lucide-react"

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

  // Keep a stack of previous cursors so we can go back
  const prevCursorsRaw = searchParams.get("prev") ?? ""
  const prevCursors = prevCursorsRaw ? prevCursorsRaw.split(",") : []

  const PAGE_SIZE = 12

  const tracesQuery = useQuery({
    queryKey: ["monitoring", "traces", window, type, status, cursor, PAGE_SIZE],
    queryFn: () => getTraces(window, type, status, cursor, PAGE_SIZE),
  })

  function buildUrl(params: Record<string, string | undefined>) {
    const next = new URLSearchParams()
    const merged = {
      window,
      type: type ?? "",
      status: status ?? "",
      cursor: cursor ?? "",
      prev: prevCursorsRaw,
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
              ],
            },
            {
              key: "status",
              label: "状态",
              options: [
                { label: "全部", value: "" },
                { label: "success", value: "success" },
                { label: "done", value: "done" },
                { label: "error", value: "error" },
                { label: "failed", value: "failed" },
              ],
            },
          ]}
        />

        <SectionCard
          title="链路列表"
          description="按 trace 聚合的顶层运行记录（仅 AI 相关链路）。"
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="flex min-h-0 flex-1 flex-col p-0"
        >
          {tracesQuery.isLoading ? (
            <p className="px-5 py-5 text-sm text-muted/60">正在加载链路...</p>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-2">
                  {(tracesQuery.data?.items ?? []).map((item) => (
                    <Link
                      key={item.id}
                      href={`${TRACES_ROUTE}/${item.trace_id}`}
                      className="flex cursor-pointer items-center gap-4 rounded-lg border border-border/40 bg-card/30 px-4 py-3 transition-colors hover:bg-card/60"
                    >
                      {/* Left: name + trace ID + type pill */}
                      <div className="min-w-0 flex-[2]">
                        <p className="truncate font-medium text-foreground">{item.name}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="font-mono text-xs text-muted/50">{item.trace_id}</p>
                          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted/60">
                            {item.run_type}
                          </span>
                        </div>
                      </div>

                      {/* Right: meta info + badge */}
                      <div className="flex items-center gap-4 text-xs text-muted">
                        <span className="tabular">{formatDateTime(item.started_at)}</span>
                        <span className="tabular text-muted/70">{formatDuration(item.duration_ms)}</span>
                        <span className="hidden text-muted/50 xl:block">
                          {item.metadata?.path ? String(item.metadata.path) : "内部任务"}
                        </span>
                        <StatusBadge status={item.status} />
                      </div>
                    </Link>
                  ))}

                  {!tracesQuery.data?.items.length ? (
                    <p className="py-8 text-center text-sm text-muted/60">当前筛选条件下没有链路记录。</p>
                  ) : null}
                </div>
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
