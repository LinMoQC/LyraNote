"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { SectionCard } from "@/components/section-card"
import { StatusBadge } from "@/components/status-badge"
import { formatDateTime } from "@/lib/utils"
import { WorkerHeartbeat } from "@/services/monitoring-service"

const PAGE_SIZE = 12

export function WorkersTable({ workers }: { workers: WorkerHeartbeat[] }) {
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(workers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const visibleWorkers = workers.slice(start, start + PAGE_SIZE)
  const hasPrev = currentPage > 1
  const hasNext = currentPage < totalPages

  return (
    <SectionCard
      title="Worker 心跳"
      description="每 30 秒刷新一次组件级心跳。"
      className="flex min-h-0 flex-1 flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col p-0"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/30">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_2fr_80px_1fr_1fr] items-center bg-white/[0.03] px-5 py-2.5 text-[10px] uppercase tracking-[0.18em] text-muted/60">
          <span>组件</span>
          <span>实例 ID</span>
          <span>状态</span>
          <span>主机</span>
          <span>最后心跳</span>
        </div>

        {/* Data rows */}
        <div className="min-h-0 flex-1 divide-y divide-border/30 overflow-y-auto">
          {visibleWorkers.map((worker) => (
            <div
              key={worker.instance_id}
              className="grid grid-cols-[1fr_2fr_80px_1fr_1fr] items-center px-5 py-3 text-sm transition-colors hover:bg-white/[0.03]"
            >
              <span className="font-medium text-foreground">{worker.component}</span>
              <span className="font-mono text-xs text-muted/70">{worker.instance_id}</span>
              <span>
                <StatusBadge status={worker.status} />
              </span>
              <span className="text-muted">
                {worker.hostname}:{worker.pid}
              </span>
              <span className="text-muted">{formatDateTime(worker.last_seen_at)}</span>
            </div>
          ))}

          {workers.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted/60">
              暂无 Worker 心跳记录。
            </div>
          ) : null}
        </div>
      </div>

      {workers.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-border/30 px-5 py-4">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={!hasPrev}
            className="flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft size={14} />
            上一页
          </button>
          <span className="text-xs text-muted/50">
            第 {currentPage} / {totalPages} 页 · 每页 {PAGE_SIZE} 条 · 共 {workers.length} 条
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={!hasNext}
            className="flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            下一页
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}
    </SectionCard>
  )
}
