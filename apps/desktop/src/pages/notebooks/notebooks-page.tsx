import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Grid3X3, List, BookOpen, FileText, Globe, Lock, Loader2, MoreHorizontal, Hash } from "lucide-react"
import { pageVariants, pageTransition, staggerContainer, staggerItem, springs, fadeScale } from "@/lib/animations"
import { useTabStore } from "@/store/use-tab-store"
import { cn } from "@/lib/cn"
import { http } from "@/lib/http"

interface Notebook {
  id: string
  title: string
  description: string | null
  source_count: number
  note_count: number
  word_count: number
  is_public: boolean
  cover_emoji: string | null
  cover_gradient: string | null
  updated_at: string
}

export function NotebooksPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const { openTab } = useTabStore()

  useEffect(() => {
    fetchNotebooks()
  }, [])

  async function fetchNotebooks() {
    setLoading(true)
    try {
      const res = await http.get("/api/v1/notebooks")
      setNotebooks(res.data.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    const title = newTitle.trim()
    if (!title || creating) return
    setCreating(true)
    try {
      const res = await http.post("/api/v1/notebooks", { title })
      const nb: Notebook = res.data.data
      setNotebooks((prev) => [nb, ...prev])
      setShowNew(false)
      setNewTitle("")
    } finally {
      setCreating(false)
    }
  }

  function openNotebook(nb: Notebook) {
    openTab({ type: "editor" as never, title: nb.title, meta: { notebookId: nb.id } })
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b shrink-0"
        style={{ borderColor: "var(--color-border)" }}>
        <h1 className="text-[22px] font-bold text-[var(--color-text-primary)]">我的笔记本</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border overflow-hidden"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}>
            <button
              onClick={() => setViewMode("grid")}
              className={cn("p-2 transition-colors", viewMode === "grid" ? "text-[var(--color-accent)] bg-[var(--color-accent-muted)]" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]")}
            ><Grid3X3 size={15} /></button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("p-2 transition-colors", viewMode === "list" ? "text-[var(--color-accent)] bg-[var(--color-accent-muted)]" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]")}
            ><List size={15} /></button>
          </div>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium text-white transition-colors"
            style={{ background: "var(--color-accent)" }}
          >
            <Plus size={15} strokeWidth={2.5} />
            新建笔记本
          </motion.button>
        </div>
      </div>

      {/* New notebook dialog */}
      <AnimatePresence>
        {showNew && (
          <motion.div
            variants={fadeScale}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springs.bouncy}
            className="mx-8 mt-4 p-4 rounded-2xl border flex items-center gap-3 shrink-0"
            style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-accent)", borderWidth: 1.5 }}
          >
            <BookOpen size={18} className="text-[var(--color-accent)] shrink-0" />
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
                if (e.key === "Escape") { setShowNew(false); setNewTitle("") }
              }}
              placeholder="笔记本名称..."
              className="flex-1 bg-transparent outline-none text-[14px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
            />
            {creating && <Loader2 size={14} className="animate-spin text-[var(--color-accent)] shrink-0" />}
            <button onClick={() => { setShowNew(false); setNewTitle("") }}
              className="text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] px-2">
              取消
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-[var(--color-text-tertiary)]" />
          </div>
        ) : notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <BookOpen size={28} className="text-[var(--color-text-tertiary)]" />
            <p className="text-[13px] text-[var(--color-text-tertiary)]">还没有笔记本，点击新建开始吧</p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className={cn(
              viewMode === "grid"
                ? "grid grid-cols-2 xl:grid-cols-3 gap-4"
                : "flex flex-col gap-2"
            )}
          >
            {notebooks.map((nb, i) => {
              const accents = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899"]
              const accent = accents[i % accents.length]
              return (
                <motion.div
                  key={nb.id}
                  variants={staggerItem}
                  transition={springs.bouncy}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => openNotebook(nb)}
                  className="relative flex flex-col p-5 rounded-xl border cursor-pointer group"
                  style={{
                    background: "var(--color-bg-elevated)",
                    borderColor: "var(--color-border)",
                    borderLeft: `3px solid ${accent}`,
                    transition: "background 150ms, box-shadow 150ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `color-mix(in srgb, var(--color-bg-elevated) 94%, ${accent})`
                    e.currentTarget.style.boxShadow = `0 4px 20px rgba(0,0,0,0.2)`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--color-bg-elevated)"
                    e.currentTarget.style.boxShadow = "none"
                  }}
                >
                  {/* Title + menu */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-[14px] font-semibold leading-snug" style={{ color: "var(--color-text-primary)" }}>
                      {nb.title}
                    </h3>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="w-6 h-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      style={{ color: "var(--color-text-tertiary)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "var(--color-text-secondary)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-tertiary)" }}
                    >
                      <MoreHorizontal size={13} />
                    </button>
                  </div>

                  {/* Description */}
                  <p className="text-[12.5px] leading-relaxed line-clamp-2 mb-4" style={{ color: "var(--color-text-tertiary)" }}>
                    {nb.description || "暂无描述"}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    <span className="flex items-center gap-1.5">
                      <FileText size={11} style={{ opacity: 0.55 }} />
                      {nb.source_count} 来源
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BookOpen size={11} style={{ opacity: 0.55 }} />
                      {nb.note_count} 笔记
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Hash size={11} style={{ opacity: 0.55 }} />
                      {nb.word_count >= 1000 ? `${(nb.word_count / 1000).toFixed(1)}k` : nb.word_count} 字
                    </span>
                    <span className="ml-auto flex items-center gap-1" style={{ opacity: 0.4 }}>
                      {nb.is_public ? <Globe size={10} /> : <Lock size={10} />}
                      <span>{nb.is_public ? "公开" : "私有"}</span>
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
