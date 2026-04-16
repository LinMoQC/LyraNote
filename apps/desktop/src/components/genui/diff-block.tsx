"use client"

import { memo, useMemo } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { safeParseJSON } from "./utils"

interface DiffData {
  label_before?: string
  label_after?: string
  before: string
  after: string
}

interface DiffToken {
  text: string
  type: "same" | "add" | "del"
}

function computeWordDiff(before: string, after: string): DiffToken[] {
  const wordsA = before.split(/(\s+)/)
  const wordsB = after.split(/(\s+)/)

  const m = wordsA.length
  const n = wordsB.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = wordsA[i - 1] === wordsB[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  const result: DiffToken[] = []
  let i = m, j = n
  const stack: DiffToken[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      stack.push({ text: wordsA[i - 1], type: "same" })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ text: wordsB[j - 1], type: "add" })
      j--
    } else {
      stack.push({ text: wordsA[i - 1], type: "del" })
      i--
    }
  }

  while (stack.length) result.push(stack.pop()!)
  return result
}

function DiffBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui")
  if (isStreaming) {
    return (
      <div className="my-3 flex h-20 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs text-white/40">
        {t("diffStreaming")}
      </div>
    )
  }

  const data = safeParseJSON<DiffData>(code)
  if (!data || typeof data.before !== "string" || typeof data.after !== "string") return <pre className="my-2 overflow-x-auto rounded-xl bg-white/[0.06] p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const tokens = useMemo(() => computeWordDiff(data.before, data.after), [data.before, data.after])

  return (
    <div className="my-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="mb-2 flex gap-4 text-[10px] text-white/35">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-red-500/30" />
          {data.label_before ?? t("diffBefore")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/30" />
          {data.label_after ?? t("diffAfter")}
        </span>
      </div>
      <div className="text-sm leading-relaxed text-white/80">
        {tokens.map((t, i) => (
          <span
            key={i}
            className={cn(
              t.type === "add" && "rounded bg-emerald-500/20 text-emerald-300",
              t.type === "del" && "rounded bg-red-500/20 text-red-300 line-through",
            )}
          >
            {t.text}
          </span>
        ))}
      </div>
    </div>
  )
}

export const DiffBlock = memo(DiffBlockInner)
