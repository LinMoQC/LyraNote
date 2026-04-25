import { useRef, useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { BarChart3, ChevronDown, MoreHorizontal, Plus, Loader2, Check } from "lucide-react"

import { cn } from "@/lib/cn"
import type { Note } from "@lyranote/types"

interface EditorHeaderProps {
  notebookTitle: string
  noteTitle: string
  charCount: number
  saveStatus?: "idle" | "saving" | "saved"
  notes?: Note[]
  activeNoteId?: string | null
  onNoteSelect?: (noteId: string) => void
  onNoteCreate?: () => void
  creatingNote?: boolean
  onBack: () => void
}

export function EditorHeader({
  noteTitle,
  charCount,
  saveStatus = "idle",
  notes = [],
  activeNoteId,
  onNoteSelect,
  onNoteCreate,
  creatingNote = false,
}: EditorHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return
    function handle(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [pickerOpen])

  return (
    <div
      className="flex h-10 shrink-0 items-center justify-between px-4 border-b"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Left: note picker only — notebook context already shown in tab bar */}
      <div className="flex min-w-0 flex-1 items-center text-[13px]">
        {/* Note picker */}
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors max-w-[320px]",
              pickerOpen
                ? "bg-white/[0.08] text-[var(--color-text-primary)]"
                : "text-[var(--color-text-primary)] hover:bg-white/[0.05]",
            )}
          >
            <span className="truncate font-medium text-[13px]">
              {noteTitle || "无标题"}
            </span>
            <ChevronDown size={12} className="shrink-0 opacity-40" />
          </button>

          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className="absolute left-0 top-full z-50 mt-1.5 w-[220px] overflow-hidden rounded-xl p-1"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-strong)",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                }}
              >
                {/* Note list */}
                <div className="max-h-[240px] overflow-y-auto">
                  {notes.length === 0 ? (
                    <p className="px-3 py-2 text-[12px] text-[var(--color-text-tertiary)]">暂无笔记</p>
                  ) : (
                    notes.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => {
                          onNoteSelect?.(note.id)
                          setPickerOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                          note.id === activeNoteId
                            ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                            : "text-[var(--color-text-secondary)] hover:bg-white/[0.06]",
                        )}
                      >
                        <span className="flex-1 truncate">{note.title || "无标题"}</span>
                        {note.id === activeNoteId && <Check size={12} className="shrink-0" />}
                      </button>
                    ))
                  )}
                </div>

                {/* New note button */}
                {onNoteCreate && (
                  <>
                    <div className="my-1 mx-2 h-px" style={{ background: "var(--color-border)" }} />
                    <button
                      type="button"
                      disabled={creatingNote}
                      onClick={() => {
                        onNoteCreate()
                        setPickerOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[var(--color-text-tertiary)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-40"
                    >
                      {creatingNote ? <Loader2 size={13} className="animate-spin shrink-0" /> : <Plus size={13} className="shrink-0" />}
                      新建笔记
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right: save status + word count + more menu */}
      <div className="flex items-center gap-1.5">
        {/* Save status */}
        <AnimatePresence mode="wait">
          {saveStatus === "saving" && (
            <motion.span
              key="saving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[11px] text-[var(--color-text-tertiary)]"
            >
              保存中…
            </motion.span>
          )}
          {saveStatus === "saved" && (
            <motion.span
              key="saved"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]"
            >
              <Check size={11} />
              已保存
            </motion.span>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--color-text-tertiary)]">
          <BarChart3 size={12} />
          <span className="tabular-nums">{charCount}</span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              menuOpen
                ? "bg-white/[0.1] text-[var(--color-text-primary)]"
                : "text-[var(--color-text-tertiary)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)]",
            )}
          >
            <MoreHorizontal size={15} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="absolute right-0 top-full z-50 mt-1.5 w-[180px] overflow-hidden rounded-xl p-1.5"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border-strong)",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                  }}
                >
                  <div className="px-3 py-2 text-[11px] text-[var(--color-text-tertiary)]">
                    <div className="flex items-center justify-between">
                      <span>字数</span>
                      <span className="tabular-nums">{charCount}</span>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
