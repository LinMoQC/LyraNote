"use client"

import { createPortal } from "react-dom"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Check, RefreshCw, Sparkles, Undo2 } from "lucide-react"
import { useTranslations } from "next-intl"
import type { Editor } from "@tiptap/react"
import type { AppliedEdit } from "@/hooks/use-inline-rewrite"
import { OriginalThinkingLoader } from "./original-thinking-loader"

export interface SelectionAnchor {
  /** Tiptap doc position to track — recomputed on scroll via coordsAtPos */
  from: number
  /** Width of the selection bounding rect, captured at click time */
  width: number
}

interface Props {
  editor: Editor | null
  anchor: SelectionAnchor | null
  isLoading: boolean
  loadingLabel: string
  appliedEdit: AppliedEdit | null
  onAccept: () => void
  onRetry: () => void
  onReject: () => void
}

export function InlineRewriteOverlay({
  editor,
  anchor,
  isLoading,
  loadingLabel,
  appliedEdit,
  onAccept,
  onRetry,
  onReject,
}: Props) {
  const t = useTranslations("editor")
  const [mounted, setMounted] = useState(false)

  // The outer wrapper div — we mutate its style directly to avoid React re-render jitter
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Compute initial position synchronously (before paint) to avoid flash at (0,0)
  const [initialPos, setInitialPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!editor || !anchor) { setInitialPos(null); return }
    try {
      const safeFrom = Math.min(anchor.from, editor.state.doc.content.size - 1)
      const coords = editor.view.coordsAtPos(safeFrom)
      setInitialPos({ top: coords.bottom + 6, left: coords.left })
    } catch {}
  }, [editor, anchor])

  // On scroll: bypass React state — update the DOM directly via rAF for jitter-free tracking
  useEffect(() => {
    if (!editor || !anchor || !initialPos) return

    let rafId: number

    const update = () => {
      if (!wrapperRef.current) return
      try {
        const safeFrom = Math.min(anchor.from, editor.state.doc.content.size - 1)
        const coords = editor.view.coordsAtPos(safeFrom)
        wrapperRef.current.style.top = `${coords.bottom + 6}px`
        wrapperRef.current.style.left = `${coords.left}px`
      } catch {}
    }

    const onScroll = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(update)
    }

    window.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true })
      cancelAnimationFrame(rafId)
    }
  }, [editor, anchor, initialPos])

  const visible = isLoading || !!appliedEdit
  if (!mounted || !anchor || !initialPos || !visible) return null

  const content = (
    <div
      ref={wrapperRef}
      style={{
        position: "fixed",
        top: initialPos.top,
        left: initialPos.left,
        width: anchor.width,
        zIndex: 9999,
      }}
    >
      {isLoading ? (
        /* ── Loading ─────────────────────────────────────────────── */
        <div className="flex w-full items-center gap-2.5 rounded-[10px] border border-white/[0.12] bg-[#1c1c1e]/96 px-3.5 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-sm">
          <OriginalThinkingLoader size={22} className="shrink-0 text-primary/70" />
          <span className="text-[13px] text-foreground/55">{loadingLabel}...</span>
        </div>
      ) : appliedEdit ? (
        /* ── Applied — compact action bar ───────────────────────── */
        <div className="flex w-full items-center gap-2 rounded-[10px] border border-white/[0.12] bg-[#1c1c1e]/96 px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-sm">
          {/* Label */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Sparkles size={11} className="shrink-0 text-primary/60" />
            <span className="truncate text-[12px] text-foreground/45">
              {t(`selectionSkill.${appliedEdit.action}`)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onAccept}
              className="flex items-center gap-1 rounded-[6px] bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
            >
              <Check size={10} />
              {t("selectionApply")}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRetry}
              className="flex items-center gap-1 rounded-[6px] border border-white/10 px-2.5 py-1 text-[11px] text-foreground/50 transition-colors hover:bg-white/[0.06] hover:text-foreground/75"
            >
              <RefreshCw size={10} />
              {t("selectionRetry")}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onReject}
              className="flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[11px] text-foreground/30 transition-colors hover:bg-white/[0.05] hover:text-foreground/55"
            >
              <Undo2 size={10} />
              {t("selectionCancel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )

  return createPortal(content, document.body)
}
