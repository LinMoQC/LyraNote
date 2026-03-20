"use client"

import { AtSign, FileText, X } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { useTranslations } from "next-intl"

import { getNotebooks } from "@/services/notebook-service"
import { cn } from "@/lib/utils"
import type { Notebook } from "@/types"

export interface NotebookPickerHandle {
  open: () => void
}

interface NotebookPickerProps {
  selected: Notebook | null
  onSelect: (notebook: Notebook | null) => void
}

export const NotebookPicker = forwardRef<NotebookPickerHandle, NotebookPickerProps>(
  function NotebookPicker({ selected, onSelect }, ref) {
  const t = useTranslations("home")
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }))

  const { data: notebooks = [] } = useQuery({
    queryKey: ["notebooks"],
    queryFn: getNotebooks,
    enabled: open,
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  if (selected) {
    return (
      <div className="flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary/90">
        <AtSign size={10} />
        <span className="max-w-[120px] truncate">{selected.title}</span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-primary/20"
        >
          <X size={9} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Dropdown */}
      <div
        className={cn(
          "absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl",
          "origin-bottom transition-all duration-200 ease-out",
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-1 scale-95 opacity-0",
        )}
      >
        <p className="px-4 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("notebook")}
        </p>
        {notebooks.length === 0 ? (
          <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground/50">
            暂无笔记本
          </p>
        ) : (
          <div className="max-h-[200px] overflow-y-auto">
            {notebooks.map((nb) => (
              <button
                key={nb.id}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-accent/60 hover:text-foreground"
                onClick={() => {
                  onSelect(nb)
                  setOpen(false)
                }}
                type="button"
              >
                <FileText className="flex-shrink-0 text-muted-foreground" size={14} />
                <span className="min-w-0 flex-1 truncate text-left">{nb.title}</span>
                {nb.sourceCount > 0 && (
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground/40">
                    {nb.sourceCount} 源
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Trigger button */}
      <button
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          open
            ? "bg-accent text-foreground"
            : "bg-accent/60 text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <AtSign size={11} />
        {t("notebook")}
      </button>
    </div>
  )
})
