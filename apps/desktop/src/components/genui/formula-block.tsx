"use client"

import { useTranslations } from "next-intl"

import { memo, useEffect, useRef } from "react"
import katex from "katex"
import "katex/dist/katex.min.css"

function FormulaBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui")
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isStreaming || !containerRef.current) return
    try {
      katex.render(code.trim(), containerRef.current, {
        displayMode: true,
        throwOnError: false,
        trust: true,
      })
    } catch {
      if (containerRef.current) containerRef.current.textContent = code
    }
  }, [code, isStreaming])

  if (isStreaming) {
    return (
      <div className="my-3 flex h-16 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs text-white/40">
        {t("formulaStreaming")}
      </div>
    )
  }

  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
      <div ref={containerRef} className="text-center text-white/90" />
    </div>
  )
}

export const FormulaBlock = memo(FormulaBlockInner)
