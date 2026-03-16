"use client"

/**
 * @file 行内引用徽章组件
 * @description 渲染 AI 回复中的引用编号徽章，悬停/点击时弹出引用来源的
 *              标题、相关度得分和摘要预览。使用 Portal 渲染弹出层以避免层级问题。
 */

import { AnimatePresence, m } from "framer-motion"
import { FileText } from "lucide-react"
import { useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { CitationData } from "@/types"

/**
 * 相关度得分指示点
 * @param score - 0~1 的相关度得分
 */
function ScoreDot({ score }: { score?: number }) {
  if (score == null) return null
  const pct = Math.round(score * 100)
  const bg =
    pct >= 70 ? "bg-emerald-400" :
    pct >= 40 ? "bg-amber-400" :
    "bg-muted-foreground/50"
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${bg}`} />
}

/**
 * 行内引用徽章
 * @param index - 引用编号（从 1 开始）
 * @param citation - 引用数据（来源标题、摘要等）
 */
export function InlineCitationBadge({
  index,
  citation,
}: {
  index: number
  citation?: CitationData
}) {
  const POPOVER_W = 260
  const EDGE_PAD = 12

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, below: false })
  const badgeRef = useRef<HTMLSpanElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  function calcPos() {
    if (!badgeRef.current) return
    const rect = badgeRef.current.getBoundingClientRect()
    const idealLeft = rect.left + rect.width / 2 - POPOVER_W / 2
    const clampedLeft = Math.max(EDGE_PAD, Math.min(idealLeft, window.innerWidth - POPOVER_W - EDGE_PAD))
    const useBelow = rect.top < 140
    setPos({ top: useBelow ? rect.bottom + 8 : rect.top - 8, left: clampedLeft, below: useBelow })
  }

  function showPopover() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    calcPos()
    setOpen(true)
  }

  function scheduleHide() {
    timeoutRef.current = setTimeout(() => setOpen(false), 200)
  }

  function cancelHide() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  // onClick handles both desktop clicks and mobile taps (tap generates click after touchend).
  // Using only onClick avoids the double-fire issue from pairing onTouchStart + onClick.
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (open) setOpen(false)
    else { calcPos(); setOpen(true) }
  }

  if (!citation) {
    return (
      <span className="mx-0.5 inline-flex h-[18px] min-w-[18px] cursor-default items-center justify-center rounded-full bg-primary/20 px-1 align-middle text-[10px] font-bold leading-none text-primary">
        {index}
      </span>
    )
  }

  const scorePct = citation.score != null ? Math.round(citation.score * 100) : null

  return (
    <>
      <span
        ref={badgeRef}
        onMouseEnter={showPopover}
        onMouseLeave={scheduleHide}
        onClick={handleClick}
        className="mx-0.5 inline-flex h-[18px] min-w-[18px] cursor-pointer items-center justify-center rounded-full bg-primary/20 px-1 align-middle text-[10px] font-bold leading-none text-primary transition-colors hover:bg-primary/30"
      >
        {index}
      </span>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <m.div
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              onMouseEnter={cancelHide}
              onMouseLeave={scheduleHide}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                transform: pos.below ? "translateY(0)" : "translateY(-100%)",
                zIndex: 9999,
              }}
              className="pointer-events-auto w-[260px] overflow-hidden rounded-xl border border-border/50 bg-card shadow-2xl shadow-black/60"
            >
              {/* Header */}
              <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-[10px] font-bold text-primary">
                  {index}
                </span>
                <FileText size={11} className="flex-shrink-0 text-muted-foreground/50" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/85">
                  {citation.source_title}
                </span>
                {scorePct != null && (
                  <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground/60">
                    <ScoreDot score={citation.score} />
                    {scorePct}%
                  </span>
                )}
              </div>

              {/* Excerpt */}
              {citation.excerpt && (
                <div className="px-3 py-2.5">
                  <p className="line-clamp-4 text-[11px] leading-relaxed text-muted-foreground/65">
                    {citation.excerpt}
                  </p>
                </div>
              )}
            </m.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
