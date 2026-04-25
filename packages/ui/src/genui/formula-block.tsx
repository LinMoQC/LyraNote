"use client"

import { memo, useEffect, useRef } from "react"
import katex from "katex"
import "katex/dist/katex.min.css"
import { GenUIStreamingPlaceholder } from "./genui-streaming-placeholder"

function FormulaBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
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

  if (isStreaming) return <GenUIStreamingPlaceholder />

  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-border/40 bg-muted/10 px-4 py-3">
      <div ref={containerRef} className="text-center text-foreground/90" />
    </div>
  )
}

export const FormulaBlock = memo(FormulaBlockInner)
