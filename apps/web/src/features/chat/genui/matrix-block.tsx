"use client"

import { memo, useMemo } from "react"
import { cn } from "@/lib/utils"
import { safeParseJSON } from "./utils"

interface MatrixOption {
  name: string
  scores: number[]
}

interface MatrixData {
  criteria: string[]
  weights?: number[]
  options: MatrixOption[]
}

function scoreColor(score: number, max: number = 10): string {
  const ratio = score / max
  if (ratio >= 0.8) return "bg-emerald-500/25 text-emerald-300"
  if (ratio >= 0.6) return "bg-emerald-500/10 text-emerald-400/70"
  if (ratio >= 0.4) return "bg-amber-500/10 text-amber-300/70"
  return "bg-red-500/10 text-red-300/70"
}

function MatrixBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  if (isStreaming) {
    return (
      <div className="my-3 flex h-32 items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground/60">
        正在生成评估矩阵...
      </div>
    )
  }

  const data = safeParseJSON<MatrixData>(code)
  if (!data || !Array.isArray(data.criteria) || !Array.isArray(data.options)) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  const weights = data.weights ?? data.criteria.map(() => 1 / data.criteria.length)

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const totals = useMemo(() =>
    data.options.map((opt) =>
      opt.scores.reduce((sum, s, i) => sum + s * (weights[i] ?? 0), 0)
    ), [data.options, weights])

  const maxTotal = Math.max(...totals)

  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-border/40">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-white/[0.04]">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-foreground/70">方案</th>
            {data.criteria.map((c, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2 text-center text-xs font-semibold text-foreground/70">
                {c}
                {weights[i] != null && (
                  <span className="ml-1 text-[10px] text-muted-foreground/40">({(weights[i] * 100).toFixed(0)}%)</span>
                )}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2 text-center text-xs font-semibold text-foreground/70">综合分</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {data.options.map((opt, oi) => (
            <tr key={oi} className="transition-colors hover:bg-white/[0.02]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground/80">
                {opt.name}
                {totals[oi] === maxTotal && (
                  <span className="ml-1.5 inline-block rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-400">TOP</span>
                )}
              </td>
              {opt.scores.map((s, si) => (
                <td key={si} className="px-3 py-2 text-center">
                  <span className={cn("inline-block min-w-[2rem] rounded-md px-1.5 py-0.5 text-xs tabular-nums", scoreColor(s))}>
                    {s}
                  </span>
                </td>
              ))}
              <td className="px-3 py-2 text-center">
                <span className={cn(
                  "inline-block min-w-[3rem] rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                  totals[oi] === maxTotal ? "bg-amber-500/20 text-amber-300" : "bg-white/[0.06] text-foreground/70"
                )}>
                  {totals[oi].toFixed(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const MatrixBlock = memo(MatrixBlockInner)
