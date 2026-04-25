"use client";

import { m } from "framer-motion";
import {
  BarChart2,
  Clock,
  FileText,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import type { DrPlanData } from "./dr-types";

interface DrPlanCardProps {
  plan: DrPlanData
  mode: "quick" | "deep"
  onConfirm: (editedPlan: DrPlanData) => void
  onCancel: () => void
  isStarting?: boolean
}

export function DrPlanCard({ plan, mode, onConfirm, onCancel, isStarting }: DrPlanCardProps) {
  const t = useTranslations("deepResearch")
  const [editing, setEditing] = useState(false)
  const [questions, setQuestions] = useState<string[]>(plan.subQuestions)

  useEffect(() => {
    setQuestions(plan.subQuestions)
  }, [plan.subQuestions])

  function updateQuestion(i: number, val: string) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? val : q)))
  }

  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i))
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, ""])
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>("[data-plan-question]")
      inputs[inputs.length - 1]?.focus()
    }, 50)
  }

  function handleConfirm() {
    onConfirm({
      ...plan,
      subQuestions: questions.filter((q) => q.trim()),
      searchMatrix: plan.searchMatrix,
    })
  }

  const phases = [
    {
      icon: Search,
      label: t("phaseResearch"),
      content: questions,
    },
    {
      icon: BarChart2,
      label: t("phaseAnalyze"),
      content: null,
    },
    {
      icon: FileText,
      label: t("phaseReport"),
      content: null,
    },
  ]

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border/40 bg-card shadow-sm 2xl:max-w-4xl"
    >
      {/* Header */}
      <div className="border-b border-border/30 px-4 py-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary/80">
            {t("planReady")}
          </span>
          <span className="rounded-md border border-border/25 bg-muted/30 px-1.5 py-0.5 text-[9px] text-muted-foreground/45">
            <Zap size={8} className="mr-0.5 inline" />
            {mode === "quick" ? t("quickMode") : t("deepMode")}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-foreground/90 leading-snug">
          {plan.reportTitle}
        </h3>
        {plan.researchGoal && (
          <p className="mt-1.5 text-[11px] italic text-muted-foreground/55 leading-relaxed">
            {plan.researchGoal}
          </p>
        )}
      </div>

      {/* Phase steps */}
      <div className="px-4 py-3 space-y-0">
        {phases.map((phase, phaseIdx) => (
          <div key={phaseIdx} className="flex gap-3">
            {/* Left: icon + connector line */}
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted/30">
                <phase.icon size={12} className="text-muted-foreground/60" />
              </div>
              {phaseIdx < phases.length - 1 && (
                <div className="mt-1 w-px flex-1 bg-border/25" style={{ minHeight: 16 }} />
              )}
            </div>

            {/* Right: content */}
            <div className={`min-w-0 flex-1 pb-4 ${phaseIdx === phases.length - 1 ? "pb-1" : ""}`}>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[12px] font-medium text-foreground/80">
                  {phase.label}
                </span>
                {phaseIdx === 0 && !isStarting && (
                  <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] transition-colors ${
                      editing
                        ? "bg-primary/10 text-primary/80"
                        : "text-muted-foreground/50 hover:bg-muted/40 hover:text-muted-foreground/70"
                    }`}
                  >
                    {t("editPlan")}
                  </button>
                )}
              </div>

              {phase.content && (
                <div className="mt-2 space-y-1.5">
                  {phase.content.map((q, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-[10px] font-medium text-muted-foreground/40">
                        ({i + 1})
                      </span>
                      {editing ? (
                        <div className="flex min-w-0 flex-1 items-start gap-1">
                          <input
                            data-plan-question
                            value={q}
                            onChange={(e) => updateQuestion(i, e.target.value)}
                            className="min-w-0 flex-1 rounded-md border border-border/30 bg-muted/20 px-2 py-0.5 text-[11px] text-foreground/80 outline-none focus:border-primary/40"
                            onKeyDown={(e) => { if (e.key === "Enter") addQuestion() }}
                          />
                          <button
                            type="button"
                            onClick={() => removeQuestion(i)}
                            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/30 transition-colors hover:text-red-400/60"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] leading-relaxed text-muted-foreground/65">{q}</span>
                      )}
                    </div>
                  ))}

                  {editing && (
                    <button
                      type="button"
                      onClick={addQuestion}
                      className="mt-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] text-muted-foreground/40 transition-colors hover:text-muted-foreground/60"
                    >
                      <Plus size={10} />
                      <span>{t("addResearchTask")}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Time estimate */}
        <div className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground/45">
          <Clock size={11} />
          <span>{mode === "quick" ? t("timeQuick") : t("timeDeep")}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 border-t border-border/20 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isStarting}
          className="rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-muted-foreground/80 disabled:opacity-40"
        >
          {t("cancelPlan")}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isStarting || questions.filter((q) => q.trim()).length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isStarting ? (
            <>
              <Loader2 size={11} className="animate-spin" />
              <span>启动中…</span>
            </>
          ) : (
            <>
              <Sparkles size={11} />
              <span>{t("confirmAndStart")}</span>
            </>
          )}
        </button>
      </div>
    </m.div>
  )
}

// ── Plan loading skeleton ──────────────────────────────────────────────────────

export function DrPlanSkeleton() {
  const t = useTranslations("deepResearch")
  const icons = [Search, BarChart2, FileText]
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border/40 bg-card shadow-sm 2xl:max-w-4xl"
    >
      <div className="border-b border-border/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Loader2 size={12} className="animate-spin text-primary/60" />
          <span className="text-[12px] text-muted-foreground/60">{t("planLoading")}</span>
        </div>
      </div>
      <div className="px-4 py-4 space-y-0">
        {icons.map((Icon, phaseIdx) => (
          <div key={phaseIdx} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted/30">
                <Icon size={12} className="text-muted-foreground/40" />
              </div>
              {phaseIdx < icons.length - 1 && (
                <div className="mt-1 w-px flex-1 bg-border/25" style={{ minHeight: phaseIdx === 0 ? 80 : 16 }} />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <div className="mt-1 h-3 w-20 animate-pulse rounded bg-muted/40" />
              {phaseIdx === 0 && (
                <div className="mt-3 space-y-2">
                  {[85, 70, 90, 65].map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-2 w-4 animate-pulse rounded bg-muted/30" />
                      <div className="h-2 animate-pulse rounded bg-muted/40" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </m.div>
  )
}
