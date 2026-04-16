"use client"

import { useTranslations } from "next-intl"

import { memo } from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import { safeParseJSON } from "./utils"

interface StepItem {
  title: string
  desc?: string
}

interface RawStepsData {
  current?: number
  steps?: Record<string, unknown>[]
  items?: Record<string, unknown>[]
}

function normalizeStep(raw: Record<string, unknown>): StepItem {
  return {
    title: String(raw.title ?? raw.name ?? raw.label ?? ""),
    desc:  raw.desc != null ? String(raw.desc) : raw.description != null ? String(raw.description) : undefined,
  }
}

function StepsBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui")
  if (isStreaming) {
    return (
      <div className="my-3 flex h-20 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs text-white/40">
        {t("stepsStreaming")}
      </div>
    )
  }

  const raw = safeParseJSON<RawStepsData>(code)
  const stepArr = raw?.steps ?? raw?.items
  if (!raw || !Array.isArray(stepArr)) return <pre className="my-2 overflow-x-auto rounded-xl bg-white/[0.06] p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  const data = { current: raw.current ?? 0, steps: stepArr.map(normalizeStep) }
  const progress = ((data.current) / data.steps.length) * 100

  return (
    <div className="my-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="space-y-3">
        {data.steps.map((step, i) => {
          const isDone = i < data.current
          const isCurrent = i === data.current
          return (
            <div key={i} className="flex items-start gap-3">
              <div className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                isDone && "bg-emerald-500/20 text-emerald-400",
                isCurrent && "bg-indigo-500 text-white shadow-[0_0_8px_rgba(99,102,241,0.4)]",
                !isDone && !isCurrent && "bg-white/[0.06] text-white/30",
              )}>
                {isDone ? <Check size={10} /> : i + 1}
              </div>
              <div>
                <p className={cn("text-sm font-medium", isCurrent ? "text-indigo-300" : isDone ? "text-white/60" : "text-white/40")}>{step.title}</p>
                {step.desc && <p className="mt-0.5 text-xs text-white/35">{step.desc}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const StepsBlock = memo(StepsBlockInner)
