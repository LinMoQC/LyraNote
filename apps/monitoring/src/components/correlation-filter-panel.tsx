"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react"

const FILTER_FIELDS = [
  { key: "conversation_id", label: "Conversation ID" },
  { key: "generation_id", label: "Generation ID" },
  { key: "task_id", label: "Task ID" },
  { key: "task_run_id", label: "Task Run ID" },
  { key: "notebook_id", label: "Notebook ID" },
  { key: "user_id", label: "User ID" },
] as const

type FilterKey = (typeof FILTER_FIELDS)[number]["key"]

type FilterState = Record<FilterKey, string>

function readFilters(searchParams: URLSearchParams): FilterState {
  return {
    conversation_id: searchParams.get("conversation_id") ?? "",
    generation_id: searchParams.get("generation_id") ?? "",
    task_id: searchParams.get("task_id") ?? "",
    task_run_id: searchParams.get("task_run_id") ?? "",
    notebook_id: searchParams.get("notebook_id") ?? "",
    user_id: searchParams.get("user_id") ?? "",
  }
}

export function CorrelationFilterPanel({ resetKeys = [] }: { resetKeys?: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()
  const [filters, setFilters] = useState<FilterState>(() => readFilters(searchParams))
  const [isOpen, setIsOpen] = useState(() => {
    const initialFilters = readFilters(searchParams)
    return Object.values(initialFilters).some(v => v !== "")
  })

  useEffect(() => {
    setFilters(readFilters(searchParams))
  }, [searchParams, queryString])

  function updateFilter(key: FilterKey, value: string) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function commit(nextFilters: FilterState) {
    const next = new URLSearchParams(searchParams.toString())
    for (const { key } of FILTER_FIELDS) {
      const value = nextFilters[key].trim()
      if (value) {
        next.set(key, value)
      } else {
        next.delete(key)
      }
    }
    for (const key of resetKeys) {
      next.delete(key)
    }
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`)
  }

  function clearFilters() {
    const cleared = {
      conversation_id: "",
      generation_id: "",
      task_id: "",
      task_run_id: "",
      notebook_id: "",
      user_id: "",
    }
    setFilters(cleared)
    commit(cleared)
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 p-4 backdrop-blur-xl shadow-panel transition-all duration-300">
      {/* Subtle top edge glow */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      
      <div className="flex flex-wrap items-center justify-between gap-3 relative z-10 cursor-pointer select-none" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-white/5 p-1.5 text-muted/80">
            <SlidersHorizontal size={14} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/80">高级筛选</p>
            <p className="text-[10px] text-muted/50 hidden sm:block">按业务 ID 过滤 trace、失败和 workload 记录</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {Object.values(filters).some(v => v !== "") && (
            <span className="flex h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(20,184,166,0.8)]" />
          )}
          {isOpen ? <ChevronUp size={14} className="text-muted/60" /> : <ChevronDown size={14} className="text-muted/60" />}
        </div>
      </div>

      {isOpen && (
        <div className="mt-5 border-t border-white/5 pt-5 relative z-10 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {FILTER_FIELDS.map((field) => (
              <label key={field.key} className="group flex flex-col gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted/50 transition-colors group-focus-within:text-accent/80">{field.label}</span>
                <input
                  value={filters[field.key]}
                  onChange={(event) => updateFilter(field.key, event.target.value)}
                  placeholder={`输入 ${field.label}`}
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground outline-none transition-all duration-300 placeholder:text-muted/35 focus:border-accent/50 focus:bg-white/[0.03] focus:shadow-[0_0_15px_rgba(20,184,166,0.1)]"
                />
              </label>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clearFilters(); }}
              className="rounded-lg border border-white/10 px-4 py-1.5 text-xs text-muted transition-colors hover:border-white/30 hover:text-foreground hover:bg-white/[0.02]"
            >
              清空
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); commit(filters); }}
              className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs text-accent transition-all duration-300 hover:bg-accent/20 hover:shadow-glow-accent hover:-translate-y-0.5"
            >
              应用过滤
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
