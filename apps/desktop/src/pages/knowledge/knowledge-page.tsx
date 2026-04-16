import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Upload, Link, ArrowUp, MoreHorizontal, Loader2, RefreshCw,
  FileText, Globe, File, Search, Trash2, RotateCcw, X, Check,
  LayoutGrid, List, CheckCircle2, AlertCircle, ExternalLink, ChevronRight,
  Settings2, AlignLeft, Scissors, Zap, ChevronDown
} from "lucide-react"
import { pageVariants, pageTransition, springs } from "@/lib/animations"
import { cn } from "@/lib/cn"
import { http } from "@/lib/http"
import { mapSource } from "@/lib/mappers"
import { useTabStore } from "@/store/use-tab-store"
import type { Source, SourceType } from "@/types"
import { REFETCH_INTERVAL_PROCESSING } from "@lyranote/types/constants"
import { openUrl } from "@tauri-apps/plugin-opener"

const TYPE_LABELS: Record<"all" | SourceType, string> = {
  all: "全部",
  pdf: "PDF",
  web: "网页",
  audio: "音频",
  doc: "文档",
}

const TYPE_CONFIG: Record<string, { color: string; bg: string; Icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }> }> = {
  pdf:   { color: "#f87171", bg: "rgba(248,113,113,0.12)", Icon: FileText },
  doc:   { color: "#34d399", bg: "rgba(52,211,153,0.12)",  Icon: FileText },
  audio: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", Icon: File },
  web:   { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  Icon: Globe },
}

function TypeIcon({ type }: { type: string }) {
  const key = type?.toLowerCase() ?? "doc"
  const cfg = TYPE_CONFIG[key] ?? { color: "#94a3b8", bg: "rgba(148,163,184,0.12)", Icon: File }
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.bg }}>
      <cfg.Icon size={15} style={{ color: cfg.color }} />
    </div>
  )
}

function StatusDot({ status }: { status: Source["status"] }) {
  if (status === "indexed") return <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-400" />
  if (status === "processing" || status === "pending") return (
    <motion.span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400"
      animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
  )
  if (status === "failed") return <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-400" />
  return null
}

function StatusBadge({ status }: { status: Source["status"] }) {
  if (status === "indexed") return (
    <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400">
      <CheckCircle2 size={10} />已索引
    </span>
  )
  if (status === "processing" || status === "pending") return (
    <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400">
      <Loader2 size={10} className="animate-spin" />处理中
    </span>
  )
  if (status === "failed") return (
    <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-400">
      <AlertCircle size={10} />失败
    </span>
  )
  return null
}

function KnowledgeCard({ source, onClick }: { source: Source; onClick: () => void }) {
  const name = source.title || (source.url ? (() => { try { return new URL(source.url!).hostname } catch { return source.url! } })() : "未命名")
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={springs.smooth}
      onClick={onClick}
      className="group cursor-pointer flex flex-col gap-3 rounded-xl p-3.5 border transition-all hover:border-[var(--color-border-strong)]"
      style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <TypeIcon type={source.type} />
        <StatusBadge status={source.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--color-text-primary)] line-clamp-2 leading-snug">{name}</p>
        {source.summary && (
          <p className="text-[11.5px] text-[var(--color-text-tertiary)] line-clamp-2 mt-1 leading-relaxed">{source.summary}</p>
        )}
      </div>
      <div className="flex items-center justify-between mt-auto pt-1 border-t" style={{ borderColor: "var(--color-border)" }}>
        <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums">{formatDate(source.createdAt)}</span>
        <ChevronRight size={12} className="text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  )
}

// Context menu
function ContextMenu({
  source, onDelete, onRechunk, onClose,
  anchorRef,
}: {
  source: Source
  onDelete: () => void
  onRechunk: () => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [onClose, anchorRef])

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -4 }}
      transition={springs.snappy}
      className="absolute right-0 top-8 z-50 w-40 rounded-xl overflow-hidden py-1"
      style={{
        background: "var(--color-bg-overlay)",
        border: "1px solid var(--color-border-strong)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      {(source.status === "failed" || source.status === "indexed") && (
        <button
          onClick={() => { onRechunk(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-[var(--color-text-secondary)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <RotateCcw size={13} />
          重新索引
        </button>
      )}
      <button
        onClick={() => { onDelete(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] transition-colors text-red-400"
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248,113,113,0.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
      >
        <Trash2 size={13} />
        删除
      </button>
    </motion.div>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return "刚刚"
  if (diff < 3600) return `${Math.floor(diff / 60)}m 前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h 前`
  if (diff < 172800) return "昨天"
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
}

function cleanSummary(raw: string | null): string {
  if (!raw) return ""
  const stripped = raw.replace(/^---[\s\S]*?---\s*/m, "").trim()
  const cleaned = stripped.replace(/^#+\s+/gm, "").replace(/^[-*]\s+/gm, "").trim()
  return cleaned.slice(0, 110) + (cleaned.length > 110 ? "…" : "")
}

const TYPE_FILTERS: Array<"all" | SourceType> = ["all", "pdf", "web", "audio", "doc"]

export function KnowledgePage() {
  const { openTab } = useTabStore()
  const [sources, setSources] = useState<Source[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const [search, setSearch] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [activeType, setActiveType] = useState<"all" | SourceType>("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [activeSource, setActiveSource] = useState<Source | null>(null)
  const [detailTab, setDetailTab] = useState<"chunks" | "settings">("chunks")
  const [chunks, setChunks] = useState<Array<{ id: string; chunk_index: number; content: string; token_count: number | null }>>([])
  const [chunksLoading, setChunksLoading] = useState(false)
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set())

  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [importingUrl, setImportingUrl] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)

  const [aiInput, setAiInput] = useState("")
  const [menuSourceId, setMenuSourceId] = useState<string | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSources = useCallback(async (offset = 0, append = false) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true)
    try {
      const res = await http.get("/api/v1/sources/all", { params: { offset, limit: 100 } })
      const page = res.data.data
      const items: Source[] = (page?.items ?? []).map(mapSource)
      setSources((prev) => append ? [...prev, ...items] : items)
      setTotal(page?.total ?? items.length)
      setHasMore(page?.has_more ?? false)

      // Poll if any sources are still processing
      const hasProcessing = items.some(s => s.status === "processing" || s.status === "pending")
      if (hasProcessing && !pollRef.current) {
        pollRef.current = setInterval(() => fetchSources(), REFETCH_INTERVAL_PROCESSING)
      } else if (!hasProcessing && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { fetchSources() }, [fetchSources])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])
  useEffect(() => { if (showSearch) document.getElementById("knowledge-search")?.focus() }, [showSearch])
  useEffect(() => { if (showUrlInput) setTimeout(() => urlInputRef.current?.focus(), 50) }, [showUrlInput])

  // Keep detail panel in sync if source data refreshes
  useEffect(() => {
    if (activeSource) {
      const updated = sources.find(s => s.id === activeSource.id)
      if (updated) setActiveSource(updated)
    }
  }, [sources]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch real chunks when activeSource changes
  useEffect(() => {
    if (!activeSource) { setChunks([]); return }
    setChunksLoading(true)
    setExpandedChunks(new Set())
    http.get(`/api/v1/sources/${activeSource.id}/chunks`)
      .then(res => setChunks(res.data.data ?? []))
      .catch(() => setChunks([]))
      .finally(() => setChunksLoading(false))
  }, [activeSource?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setUploadingFile(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await http.post("/api/v1/sources/global/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      const newSource: Source = mapSource(res.data.data)
      setSources((prev) => [newSource, ...prev])
      setTotal((t) => t + 1)
    } finally {
      setUploadingFile(false)
    }
  }

  async function handleImportUrl() {
    const url = urlInput.trim()
    if (!url || importingUrl) return
    setImportingUrl(true)
    try {
      const res = await http.post("/api/v1/sources/global/import-url", { url })
      const newSource: Source = mapSource(res.data.data)
      setSources((prev) => [newSource, ...prev])
      setTotal((t) => t + 1)
      setUrlInput("")
      setShowUrlInput(false)
    } finally {
      setImportingUrl(false)
    }
  }

  async function handleDelete(id: string) {
    if (activeSource?.id === id) setActiveSource(null)
    setSources((prev) => prev.filter((s) => s.id !== id))
    setTotal((t) => t - 1)
    try {
      await http.delete(`/api/v1/sources/${id}`)
    } catch {
      fetchSources()
    }
  }

  async function handleRechunk(id: string) {
    setSources((prev) => prev.map((s) => s.id === id ? { ...s, status: "processing" } : s))
    try {
      await http.post(`/api/v1/sources/${id}/rechunk`)
    } catch {
      fetchSources()
    }
  }

  function handleAiSend() {
    const q = aiInput.trim()
    if (!q) return
    setAiInput("")
    openTab({ type: "chat", title: "对话", meta: { initialMessage: q } })
  }

  const filtered = sources
    .filter(s => activeType === "all" || s.type === activeType)
    .filter(s => !search || (s.title ?? s.url ?? "").toLowerCase().includes(search.toLowerCase()))

  const menuSource = menuSourceId ? sources.find((s) => s.id === menuSourceId) ?? null : null

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="relative flex h-full flex-row overflow-hidden"
    >
      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[17px] font-semibold text-[var(--color-text-primary)]">知识库</h1>
            {!loading && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full tabular-nums"
                style={{ background: "var(--color-bg-subtle)", color: "var(--color-text-tertiary)" }}>
                {total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Search toggle */}
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowSearch((v) => !v)}
              className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-colors",
                showSearch ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-white/5"
              )}>
              <Search size={14} />
            </motion.button>
            {/* Refresh */}
            <motion.button whileTap={{ scale: 0.9, rotate: 180 }} onClick={() => fetchSources()}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-white/5 transition-colors">
              <RefreshCw size={14} />
            </motion.button>
            {/* View toggle */}
            <div className="flex items-center border rounded-lg overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => setViewMode("list")}
                className={cn("w-7 h-7 flex items-center justify-center transition-colors",
                  viewMode === "list" ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)] hover:bg-white/5"
                )}>
                <List size={13} />
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => setViewMode("grid")}
                className={cn("w-7 h-7 flex items-center justify-center transition-colors",
                  viewMode === "grid" ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)] hover:bg-white/5"
                )}>
                <LayoutGrid size={13} />
              </motion.button>
            </div>
            {/* Add URL */}
            <motion.button whileTap={{ scale: 0.94 }} onClick={() => setShowUrlInput((v) => !v)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors",
                showUrlInput ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-muted)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
              style={!showUrlInput ? { background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" } : undefined}>
              <Link size={13} />
              URL
            </motion.button>
            {/* Upload */}
            <motion.button whileTap={{ scale: 0.94 }} onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white disabled:opacity-60"
              style={{ background: "var(--color-accent)" }}>
              {uploadingFile ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              上传
            </motion.button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload}
              accept=".pdf,.md,.txt,.docx" />
          </div>
        </div>

        {/* Search bar */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={springs.snappy}
              className="overflow-hidden border-b shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center gap-2 px-6 py-2">
                <Search size={13} className="text-[var(--color-text-tertiary)] shrink-0" />
                <input
                  id="knowledge-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索来源名称..."
                  className="flex-1 bg-transparent outline-none text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
                    <X size={13} />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* URL import bar */}
        <AnimatePresence>
          {showUrlInput && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={springs.snappy}
              className="overflow-hidden border-b shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center gap-2 px-6 py-2">
                <Globe size={13} className="text-[var(--color-text-tertiary)] shrink-0" />
                <input
                  ref={urlInputRef}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleImportUrl(); if (e.key === "Escape") { setShowUrlInput(false); setUrlInput("") } }}
                  placeholder="https://..."
                  className="flex-1 bg-transparent outline-none text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] font-mono"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <motion.button whileTap={{ scale: 0.9 }}
                    onClick={handleImportUrl}
                    disabled={!urlInput.trim() || importingUrl}
                    className="w-6 h-6 flex items-center justify-center rounded-md disabled:opacity-40"
                    style={{ background: "var(--color-accent)" }}>
                    {importingUrl ? <Loader2 size={11} className="animate-spin text-white" /> : <Check size={11} className="text-white" />}
                  </motion.button>
                  <button onClick={() => { setShowUrlInput(false); setUrlInput("") }}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-white/5">
                    <X size={13} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Type filter tabs */}
        {!loading && sources.length > 0 && (
          <div className="flex items-center gap-1 px-5 py-2.5 border-b shrink-0 overflow-x-auto no-scrollbar" style={{ borderColor: "var(--color-border)" }}>
            {TYPE_FILTERS.map((type) => {
              const count = type === "all" ? total : sources.filter(s => s.type === type).length
              if (type !== "all" && count === 0) return null
              return (
                <motion.button
                  key={type}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveType(type)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium shrink-0 transition-colors",
                    activeType === type
                      ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                      : "text-[var(--color-text-secondary)] hover:bg-white/5"
                  )}
                >
                  {TYPE_LABELS[type]}
                  <span className={cn(
                    "text-[10px] tabular-nums px-1 rounded",
                    activeType === type ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
                  )}>{count}</span>
                </motion.button>
              )
            })}
          </div>
        )}

        {/* List / Grid */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={18} className="animate-spin text-[var(--color-text-tertiary)]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Upload size={24} className="text-[var(--color-text-tertiary)]" />
              <p className="text-[13px] text-[var(--color-text-tertiary)]">
                {search || activeType !== "all" ? "没有匹配的来源" : "暂无来源，上传文件或添加 URL 开始"}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="p-4 grid grid-cols-2 gap-3">
              <AnimatePresence initial={false}>
                {filtered.map((source) => (
                  <KnowledgeCard
                    key={source.id}
                    source={source}
                    onClick={() => setActiveSource(source.id === activeSource?.id ? null : source)}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="px-4 py-3">
              {/* Column header */}
              <div className="flex items-center gap-3 px-3 mb-1">
                <div className="w-8 shrink-0" />
                <span className="flex-1 text-[10px] font-medium tracking-wider uppercase text-[var(--color-text-tertiary)]">
                  {search || activeType !== "all" ? `${filtered.length} 个结果` : "名称"}
                </span>
                <span className="w-16 text-[10px] font-medium tracking-wider uppercase text-[var(--color-text-tertiary)] text-right shrink-0">时间</span>
                <div className="w-6 shrink-0" />
              </div>

              <AnimatePresence initial={false}>
                {filtered.map((source, i) => {
                  let name = source.title ?? "未命名"
                  try { if (!source.title && source.url) name = new URL(source.url).hostname } catch { /* ok */ }
                  const summary = cleanSummary(source.summary)
                  const isMenuOpen = menuSourceId === source.id
                  const isActive = activeSource?.id === source.id

                  return (
                    <motion.div
                      key={source.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ delay: Math.min(i * 0.015, 0.25), ...springs.smooth }}
                      onClick={() => setActiveSource(isActive ? null : source)}
                      className={cn(
                        "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-default transition-colors",
                        isActive
                          ? "bg-[var(--color-accent-muted)]"
                          : "hover:bg-white/[0.04]"
                      )}
                    >
                      <TypeIcon type={source.type} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusDot status={source.status} />
                          <span className={cn(
                            "text-[13px] font-medium truncate",
                            isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]"
                          )}>{name}</span>
                        </div>
                        {summary && (
                          <p className="text-[11.5px] text-[var(--color-text-tertiary)] truncate mt-0.5">{summary}</p>
                        )}
                      </div>

                      <span className="w-16 text-[11px] text-[var(--color-text-tertiary)] text-right shrink-0 tabular-nums">
                        {formatDate(source.createdAt)}
                      </span>

                      {/* Context menu trigger */}
                      <div className="relative w-6 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          ref={isMenuOpen ? (menuBtnRef as React.RefObject<HTMLButtonElement>) : undefined}
                          onClick={(e) => { e.stopPropagation(); setMenuSourceId(isMenuOpen ? null : source.id) }}
                          className={cn(
                            "w-6 h-6 flex items-center justify-center rounded-md transition-all",
                            isMenuOpen
                              ? "opacity-100 bg-white/10 text-[var(--color-text-primary)]"
                              : "opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-white/5"
                          )}
                        >
                          <MoreHorizontal size={14} />
                        </button>

                        <AnimatePresence>
                          {isMenuOpen && menuSource && (
                            <ContextMenu
                              source={menuSource}
                              onDelete={() => handleDelete(source.id)}
                              onRechunk={() => handleRechunk(source.id)}
                              onClose={() => setMenuSourceId(null)}
                              anchorRef={menuBtnRef}
                            />
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {hasMore && !search && (
                <button
                  onClick={() => fetchSources(sources.length, true)}
                  disabled={loadingMore}
                  className="w-full py-3 text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors flex items-center justify-center gap-2 mt-1"
                >
                  {loadingMore
                    ? <><Loader2 size={12} className="animate-spin" /> 加载中...</>
                    : `显示更多 · 剩余 ${total - sources.length} 个`
                  }
                </button>
              )}
            </div>
          )}
        </div>

        {/* AI input */}
        <div className="px-4 pb-4 pt-2 shrink-0 border-t" style={{ borderColor: "var(--color-border)" }}>
          <div className="rounded-xl border flex items-center gap-2 px-4 py-2.5"
            style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}>
            <input
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAiSend() } }}
              placeholder="基于知识库提问..."
              className="flex-1 bg-transparent outline-none text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
            />
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={handleAiSend}
              disabled={!aiInput.trim()}
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-lg text-white transition-opacity shrink-0",
                aiInput.trim() ? "bg-[var(--color-accent)]" : "bg-[var(--color-bg-subtle)] opacity-40"
              )}
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Detail panel — overlay, does not affect main content width */}
      <AnimatePresence>
        {activeSource && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setActiveSource(null)}
              className="absolute inset-0 z-20"
              style={{ background: "rgba(0,0,0,0.25)" }}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: 380, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 380, opacity: 0 }}
              transition={springs.snappy}
              className="absolute right-0 top-0 h-full w-[372px] z-30 flex flex-col"
            >
            <div
              className="w-[356px] h-[calc(100%-24px)] my-3 mr-3 ml-2 shrink-0 flex flex-col rounded-[16px] border shadow-[0_12px_48px_rgba(0,0,0,0.5)]"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg-base)" }}
            >
              {/* Header — fixed height to prevent layout shift */}
              <div className="flex items-start gap-3 px-4 pt-4 pb-3 shrink-0 h-[88px]">
                <div className="shrink-0 mt-0.5">
                  <TypeIcon type={activeSource.type} />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2 w-full">
                    <h3 className="text-[13.5px] font-medium text-[var(--color-text-primary)] leading-snug line-clamp-2 flex-1">
                      {activeSource.title || (activeSource.url ? (() => { try { return new URL(activeSource.url!).hostname } catch { return activeSource.url! } })() : "未命名")}
                    </h3>
                    <button onClick={() => setActiveSource(null)} className="w-6 h-6 shrink-0 flex items-center justify-center -mt-1 -mr-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-white/10 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-90">
                    <StatusBadge status={activeSource.status} />
                    {chunks.length > 0 && <span className="text-[11px] text-[var(--color-text-tertiary)] ml-0.5">• {chunks.length} 个片段</span>}
                  </div>
                </div>
              </div>

              {/* Segmented Control */}
              <div className="px-4 pb-3 shrink-0">
                <div className="flex p-0.5 rounded-[8px] border border-white/[0.04] bg-white/[0.02] relative">
                  <button onClick={() => setDetailTab('chunks')} className="relative flex-1 py-1.5 text-[12px] font-medium transition-colors z-10 flex items-center justify-center">
                    {detailTab === 'chunks' && <motion.div layoutId="tab-bg" className="absolute inset-0 rounded-[6px] bg-white/[0.08] shadow-sm ring-1 ring-black/20" style={{ zIndex: -1 }} />}
                    <span className={detailTab === 'chunks' ? "text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}>切割片段</span>
                  </button>
                  <button onClick={() => setDetailTab('settings')} className="relative flex-1 py-1.5 text-[12px] font-medium transition-colors z-10 flex items-center justify-center">
                    {detailTab === 'settings' && <motion.div layoutId="tab-bg" className="absolute inset-0 rounded-[6px] bg-white/[0.08] shadow-sm ring-1 ring-black/20" style={{ zIndex: -1 }} />}
                    <span className={detailTab === 'settings' ? "text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}>设置</span>
                  </button>
                </div>
              </div>

              {/* Tabs Content */}
              <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 no-scrollbar">
                <AnimatePresence mode="wait">
                  {detailTab === 'chunks' && (
                    <motion.div key="chunks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col gap-2 py-1">
                      {chunksLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 size={16} className="animate-spin text-[var(--color-text-tertiary)]" />
                        </div>
                      ) : chunks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                          <Scissors size={18} className="text-[var(--color-text-tertiary)]" />
                          <p className="text-[12px] text-[var(--color-text-tertiary)]">暂无片段</p>
                        </div>
                      ) : chunks.map((chunk) => {
                        const isExpanded = expandedChunks.has(chunk.chunk_index)
                        return (
                          <div key={chunk.id} className="group rounded-lg border border-white/[0.05] bg-[var(--color-bg-elevated)] hover:border-white/[0.09] transition-colors overflow-hidden">
                            {/* Header row */}
                            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
                              <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
                                #{chunk.chunk_index + 1}
                              </span>
                              {chunk.token_count != null && (
                                <span className="text-[10px] text-[var(--color-text-tertiary)]">
                                  {chunk.token_count} tokens
                                </span>
                              )}
                            </div>
                            {/* Content */}
                            <div className="px-3 py-2.5">
                              <p className={`text-[12px] text-[var(--color-text-secondary)] leading-relaxed ${isExpanded ? "" : "line-clamp-3"}`}>
                                {chunk.content}
                              </p>
                              {chunk.content.length > 120 && (
                                <button
                                  className="mt-1.5 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] inline-flex items-center gap-0.5 transition-colors"
                                  onClick={() => setExpandedChunks(prev => {
                                    const next = new Set(prev)
                                    if (next.has(chunk.chunk_index)) next.delete(chunk.chunk_index)
                                    else next.add(chunk.chunk_index)
                                    return next
                                  })}
                                >
                                  {isExpanded ? "收起" : "展开"}
                                  <ChevronDown size={10} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </motion.div>
                  )}

                  {detailTab === 'settings' && (
                    <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col py-1">
                      {/* 切割方案 */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <RefreshCw size={12} className="text-white/70" /> 
                          <span className="text-[12px] font-medium text-white">切割方案</span>
                        </div>
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">选择后点击应用</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-2 pt-1">
                        <div className="rounded-xl p-2 bg-white/[0.02] border border-white/[0.04] flex flex-col items-center justify-center gap-1 opacity-60">
                          <span className="text-[13px] font-bold text-white">600</span>
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">粗粒度</span>
                          <span className="text-[9px] text-[var(--color-text-tertiary)] scale-90">重叠 100</span>
                        </div>
                        <div className="relative rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm" style={{ background: "var(--color-accent-muted)", border: "1px solid var(--color-accent)", opacity: 1 }}>
                          <span className="text-[13px] font-bold" style={{ color: "var(--color-accent)" }}>512</span>
                          <span className="text-[10px]" style={{ color: "var(--color-accent)" }}>标准</span>
                          <span className="text-[9px] scale-90" style={{ color: "var(--color-accent)", opacity: 0.7 }}>重叠 64</span>
                        </div>
                        <div className="rounded-xl p-2 bg-white/[0.02] border border-white/[0.04] flex flex-col items-center justify-center gap-1 opacity-60">
                          <span className="text-[13px] font-bold text-white">256</span>
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">精细</span>
                          <span className="text-[9px] text-[var(--color-text-tertiary)] scale-90">重叠 32</span>
                        </div>
                        <div className="rounded-xl p-2 bg-white/[0.02] border border-white/[0.04] flex flex-col items-center justify-center gap-1 opacity-60">
                          <MoreHorizontal size={14} className="text-[var(--color-text-tertiary)] mb-0.5" />
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">自定义</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-tertiary)] mb-6 ml-0.5">每段约 512 字符，通用场景（默认）</p>

                      {/* 切割器类型 */}
                      <div className="flex items-center gap-2 mb-3">
                        <LayoutGrid size={12} className="text-white/70" /> 
                        <span className="text-[12px] font-medium text-white">切割器类型</span>
                      </div>
                      <div className="flex flex-col gap-2 mb-6">
                        <div className="relative rounded-xl p-3 overflow-hidden shadow-sm" style={{ background: "var(--color-accent-muted)", border: "1px solid var(--color-accent)" }}>
                          <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-accent)", boxShadow: "0 0 8px var(--color-accent)" }}></div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <Zap size={13} style={{ color: "var(--color-accent)" }} />
                            <span className="text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>自动</span>
                          </div>
                          <p className="text-[11px] leading-relaxed pr-4" style={{ color: "var(--color-accent)", opacity: 0.8 }}>优先语义切割，失败时回退到递归字符切割</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl p-3 bg-white/[0.02] border border-white/[0.04] opacity-70">
                            <div className="flex items-center gap-2 mb-1.5">
                              <AlignLeft size={13} className="text-white" />
                              <span className="text-[12px] font-medium text-white">语义切割</span>
                            </div>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">AI自动检测边界，适合长文</p>
                          </div>
                          <div className="rounded-xl p-3 bg-white/[0.02] border border-white/[0.04] opacity-70">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Scissors size={13} className="text-white" />
                              <span className="text-[12px] font-medium text-white">递归字符</span>
                            </div>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">按字符数与重叠量精确切割</p>
                          </div>
                        </div>
                      </div>

                      {activeSource.url && (
                        <div className="mb-6">
                          <p className="text-[10px] font-medium tracking-wider uppercase text-[var(--color-text-tertiary)] mb-1.5">来源链接</p>
                          <button
                            onClick={() => openUrl(activeSource.url!).catch(() => {})}
                            className="flex items-center gap-1.5 text-[12px] text-white/80 hover:text-white hover:underline truncate w-full text-left transition-colors"
                          >
                            <ExternalLink size={11} className="shrink-0" />
                            <span className="truncate">{activeSource.url}</span>
                          </button>
                        </div>
                      )}

                      {/* 高级选项 */}
                      <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] mx-0">
                        <button className="w-full flex items-center justify-between p-3 text-[12.5px] font-medium text-[var(--color-text-secondary)] hover:bg-white/[0.02] transition-colors rounded-xl">
                          <div className="flex items-center gap-2">
                            <Settings2 size={13} /> 高级选项
                          </div>
                          <ChevronDown size={14} className="text-[var(--color-text-tertiary)]" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer action */}
              {detailTab === 'settings' && (
                <div className="p-4 pt-3 mt-auto shrink-0 border-t" style={{ borderColor: "var(--color-border)" }}>
                  <button
                    onClick={() => handleRechunk(activeSource.id)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white hover:text-black hover:border-transparent border border-white/[0.1] text-[12px] font-medium text-white transition-all shadow-sm group"
                  >
                    <RefreshCw size={13} className="group-hover:animate-spin" /> 应用并重新切割
                  </button>
                </div>
              )}
            </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
