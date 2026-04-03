import { Activity, MessageSquare, Layers, Cpu } from "lucide-react"

import { MetricCard } from "@/components/metric-card"
import { formatDuration, formatPercent } from "@/lib/utils"
import { MonitoringOverview } from "@/services/monitoring-service"

export function OverviewCards({ overview }: { overview: MonitoringOverview }) {
  const workersDown = overview.workers.down > 0

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="请求总量"
        value={String(overview.requests.total)}
        hint={`5xx ${overview.requests.errors_5xx} / P95 ${formatDuration(overview.requests.p95_ms)}`}
        color="blue"
        icon={<Activity size={14} />}
      />
      <MetricCard
        label="聊天成功率"
        value={formatPercent(overview.chat.success_rate)}
        hint={`统计窗口 ${overview.window} / 总数 ${overview.chat.total}`}
        color="teal"
        icon={<MessageSquare size={14} />}
      />
      <MetricCard
        label="运行中任务"
        value={String(overview.workloads.running)}
        hint={`卡住 ${overview.workloads.stuck}`}
        color="yellow"
        icon={<Layers size={14} />}
      />
      <MetricCard
        label="Worker 健康"
        value={`${overview.workers.healthy}/${overview.workers.total}`}
        hint={`stale ${overview.workers.stale} / down ${overview.workers.down}`}
        color={workersDown ? "yellow" : "green"}
        icon={<Cpu size={14} />}
      />
    </div>
  )
}
