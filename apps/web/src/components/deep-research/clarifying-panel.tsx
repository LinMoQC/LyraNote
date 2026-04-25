"use client"

import { useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import { ChevronRight, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { ClarifyQuestion } from "./dr-types"

const OPTION_LABELS = ["A", "B", "C", "D"]

interface ClarifyingPanelProps {
  questions: ClarifyQuestion[]
  onSubmit: (answers: Record<number, string>) => void
  onSkip: () => void
  isLoading?: boolean
}

export function ClarifyingPanel({ questions, onSubmit, onSkip, isLoading }: ClarifyingPanelProps) {
  const t = useTranslations("deepResearch")
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [direction, setDirection] = useState<1 | -1>(1)

  const q = questions[currentIdx]
  const total = questions.length
  const isLast = currentIdx === total - 1
  const allDone = isLast && !!answers[currentIdx]

  function selectAnswer(value: string) {
    const newAnswers = { ...answers, [currentIdx]: value }
    setAnswers(newAnswers)

    if (!isLast) {
      setTimeout(() => {
        setDirection(1)
        setCurrentIdx((i) => i + 1)
      }, 280)
    }
  }

  function goBack() {
    if (currentIdx === 0) return
    setDirection(-1)
    setCurrentIdx((i) => i - 1)
  }

  if (!q) return null

  return (
    <div className="px-3 pb-3 md:px-6">
      <div className="mx-auto max-w-3xl 2xl:max-w-4xl">
        <m.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] px-5 py-4"
        >
          {/* Header row */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-medium tracking-widest text-amber-500/60 uppercase">
              {t("clarifyPreference")}
            </span>
            <div className="flex items-center gap-2">
              {currentIdx > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="text-[10px] text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
                >
                  {t("prevQuestion")}
                </button>
              )}
              <span className="text-[10px] tabular-nums text-muted-foreground/35">
                {currentIdx + 1} / {total}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-4 h-0.5 w-full rounded-full bg-border/20">
            <m.div
              className="h-full rounded-full bg-amber-500/50"
              animate={{ width: `${((currentIdx + 1) / total) * 100}%` }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            />
          </div>

          {/* Question + options — animated per question */}
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.div
              key={currentIdx}
              custom={direction}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 24 }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: d * -24 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <p className="mb-3 text-sm font-medium text-foreground/80">{q.question}</p>

              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const label = OPTION_LABELS[oi] ?? String(oi + 1)
                  const selected = answers[currentIdx] === opt.value
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => selectAnswer(opt.value)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-all duration-150",
                        selected
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "border-border/30 bg-background/40 text-foreground/65 hover:border-amber-500/30 hover:bg-amber-500/[0.05] hover:text-foreground/90",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold",
                          selected
                            ? "border-amber-500/60 bg-amber-500/20 text-amber-600 dark:text-amber-400"
                            : "border-border/40 bg-background/60 text-muted-foreground/50",
                        )}
                      >
                        {label}
                      </span>
                      <span className="flex-1 text-xs">{opt.label}</span>
                      {selected && (
                        <m.span
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </m.div>
          </AnimatePresence>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={onSkip}
              disabled={isLoading}
              className="text-xs text-muted-foreground/35 transition-colors hover:text-muted-foreground/60"
            >
              {t("skipStart")}
            </button>

            <AnimatePresence>
              {allDone && (
                <m.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => onSubmit(answers)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {isLoading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <>
                      {t("startResearch")}
                      <ChevronRight size={11} />
                    </>
                  )}
                </m.button>
              )}
            </AnimatePresence>
          </div>
        </m.div>
      </div>
    </div>
  )
}

interface ClarifyingLoadingProps {
  className?: string
}

export function ClarifyingLoading({ className }: ClarifyingLoadingProps) {
  const t = useTranslations("deepResearch")
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={cn("px-3 pb-3 md:px-6", className)}
    >
      <div className="mx-auto max-w-3xl 2xl:max-w-4xl">
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] px-4 py-3">
          <Loader2 size={13} className="animate-spin text-amber-500/60" />
          <span className="text-xs text-amber-500/60">{t("generatingQuestions")}</span>
        </div>
      </div>
    </m.div>
  )
}
