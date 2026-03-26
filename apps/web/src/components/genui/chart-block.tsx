"use client"

import { useTranslations } from "next-intl"

import { memo } from "react"
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { safeParseJSON } from "./utils"

const COLORS = ["#6366f1", "#818cf8", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#38bdf8"]

interface RawChartData {
  type?: "bar" | "line" | "area" | "pie"
  title?: string
  xKey?: string
  yKey?: string
  data?: Record<string, unknown>[]
  items?: Record<string, unknown>[]
}

function ChartBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui")
  if (isStreaming) {
    return (
      <div className="my-3 flex h-48 items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground/60">
        {t("chartStreaming")}
      </div>
    )
  }

  const raw = safeParseJSON<RawChartData>(code)
  const chartItems = raw?.data ?? raw?.items
  if (!raw || !Array.isArray(chartItems)) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  const { type = "bar", title, xKey = "name", yKey = "value" } = raw
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
            <Area type="monotone" dataKey={yKey} fill="#6366f1" fillOpacity={0.3} stroke="#6366f1" />
          </AreaChart>
        ) : type === "line" ? (
          <LineChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey={yKey} stroke="#6366f1" strokeWidth={2} dot={{ fill: "#6366f1" }} />
          </LineChart>
        ) : (
          <BarChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
              {data.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export const ChartBlock = memo(ChartBlockInner)
