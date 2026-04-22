"use client"

import { memo, useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "../message-render/utils"
import { safeParseJSON } from "./utils"

interface QuizQuestion {
  q: string
  options: string[]
  answer: number
  explanation?: string
}

interface RawQuizData {
  title?: string
  questions?: Record<string, unknown>[]
  items?: Record<string, unknown>[]
}

function normalizeQuestion(raw: Record<string, unknown>): QuizQuestion {
  const opts = (raw.options ?? raw.choices ?? []) as string[]
  return {
    q:           String(raw.q ?? raw.question ?? raw.title ?? ""),
    options:     Array.isArray(opts) ? opts.map(String) : [],
    answer:      typeof raw.answer === "number" ? raw.answer : 0,
    explanation: raw.explanation != null ? String(raw.explanation) : undefined,
  }
}

function QuizBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui")
  const [answers, setAnswers] = useState<Record<number, number>>({})

  if (isStreaming) {
    return (
      <div className="my-3 flex h-24 items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground/60">
        {t("quizStreaming")}
      </div>
    )
  }

  const raw = safeParseJSON<RawQuizData>(code)
  const qArr = raw?.questions ?? raw?.items
  if (!raw || !Array.isArray(qArr)) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>
  const data = { title: raw.title, questions: qArr.map(normalizeQuestion) }

  const totalAnswered = Object.keys(answers).length
  const totalCorrect = Object.entries(answers).filter(([qi, ai]) => data.questions[Number(qi)]?.answer === ai).length
  const allDone = totalAnswered === data.questions.length

  return (
    <div className="my-3 space-y-4 rounded-xl border border-border/40 bg-muted/10 p-4">
      {data.title && (
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground/90">{data.title}</h4>
          {totalAnswered > 0 && (
            <span className="text-xs text-muted-foreground/60">{totalAnswered}/{data.questions.length}</span>
          )}
        </div>
      )}

      {data.questions.map((q, qi) => {
        const answered = qi in answers
        const userAnswer = answers[qi]
        const isCorrect = userAnswer === q.answer

        return (
          <div key={qi} className="space-y-2">
            <p className="text-sm font-medium text-foreground/80">
              {data.questions.length > 1 && <span className="text-muted-foreground/50">{qi + 1}. </span>}
              {q.q}
            </p>
            <div className="space-y-1.5">
              {q.options.map((opt, oi) => {
                const isSelected = userAnswer === oi
                const isRight = q.answer === oi
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={answered}
                    onClick={() => setAnswers((prev) => ({ ...prev, [qi]: oi }))}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-all",
                      !answered && "hover:bg-white/[0.06] cursor-pointer border border-transparent",
                      answered && isRight && "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
                      answered && isSelected && !isRight && "border border-red-500/40 bg-red-500/10 text-red-300",
                      answered && !isSelected && !isRight && "border border-transparent opacity-50",
                      !answered && "border border-white/[0.06]",
                    )}
                  >
                    {answered && isRight && <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />}
                    {answered && isSelected && !isRight && <XCircle size={14} className="shrink-0 text-red-400" />}
                    {!answered && <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/20 text-[10px] text-muted-foreground/50">{String.fromCharCode(65 + oi)}</span>}
                    <span>{opt}</span>
                  </button>
                )
              })}
            </div>
            {answered && q.explanation && (
              <p className={cn("mt-1 rounded-lg px-3 py-2 text-[11px] leading-relaxed", isCorrect ? "bg-emerald-500/5 text-emerald-300/80" : "bg-amber-500/5 text-amber-300/80")}>
                {q.explanation}
              </p>
            )}
          </div>
        )
      })}

      {allDone && (
        <div className="rounded-xl bg-gradient-to-r from-indigo-500/10 to-violet-500/10 p-3 text-center">
          <p className="text-sm font-semibold text-foreground/80">
            {t("quizScore", { correct: totalCorrect, total: data.questions.length })}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/60">
            {totalCorrect === data.questions.length ? t("quizAllCorrect") : t("quizKeepGoing")}
          </p>
        </div>
      )}
    </div>
  )
}

export const QuizBlock = memo(QuizBlockInner)
