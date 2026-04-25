"use client"

import { memo } from "react"
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { safeParseJSON } from "./utils"
import { GenUIStreamingPlaceholder } from "./genui-streaming-placeholder"

const COLORS = ["#6366f1", "#818cf8", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#38bdf8"]

interface RawChartData {
  type?: "bar" | "line" | "area" | "pie"
  chartType?: "bar" | "line" | "area" | "pie"
  title?: string
  xKey?: string
  yKey?: string
  yKeys?: string[]
  data?: Record<string, unknown>[]
  items?: Record<string, unknown>[]
  xAxis?: string[]
  series?: Array<{ name: string; data: number[] }>
}

function ChartBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  if (isStreaming) return <GenUIStreamingPlaceholder />

  const raw = safeParseJSON<RawChartData>(code)
  if (!raw) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  // Normalize xAxis/series format → data array format
  let chartItems = raw.data ?? raw.items
  let seriesYKeys: string[] | undefined
  if (!chartItems && raw.xAxis && raw.series) {
    seriesYKeys = raw.series.map((s) => s.name)
    chartItems = raw.xAxis.map((label, i) => {
      const point: Record<string, unknown> = { name: label }
      for (const s of raw.series!) {
        point[s.name] = s.data[i] ?? 0
      }
      return point
    })
  }

  if (!Array.isArray(chartItems)) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  const { type: rawType, chartType, title, xKey = "name" } = raw
  const type = rawType ?? chartType ?? "bar"

  // Detect y-keys: explicit yKeys array > explicit yKey > series names > auto-detect numeric keys
  const autoYKeys = raw.yKeys ??
    seriesYKeys ??
    (raw.yKey
      ? [raw.yKey]
      : Object.keys(chartItems[0] ?? {}).filter((k) => k !== xKey && typeof chartItems[0][k] === "number"))
  const yKeys = autoYKeys.length > 0 ? autoYKeys : ["value"]
  const yKey = yKeys[0]
  const data = { type, title, xKey, yKey, data: chartItems }

  return (
    <div className="my-3 rounded-xl border border-border/40 bg-muted/10 p-4">
      {title && <p className="mb-3 text-sm font-medium text-foreground/80">{title}</p>}
      <ResponsiveContainer width="100%" height={280}>
        {type === "pie" ? (
          <PieChart>
            <Pie data={data.data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={100} label>
              {data.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            <Legend />
          </PieChart>
        ) : type === "area" ? (
          <AreaChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} fill={COLORS[i % COLORS.length]} fillOpacity={0.3} stroke={COLORS[i % COLORS.length]} />
            ))}
          </AreaChart>
        ) : type === "line" ? (
          <LineChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ fill: COLORS[i % COLORS.length] }} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            {yKeys.length > 1 && <Legend />}
            {yKeys.length > 1
              ? yKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                ))
              : (
                  <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
                    {data.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                )
            }
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export const ChartBlock = memo(ChartBlockInner)
