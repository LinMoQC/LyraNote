import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus, Grid3X3, List, BookOpen, FileText, Globe, GlobeLock,
  Loader2, MoreHorizontal, Hash, Pencil, Trash2,
} from "lucide-react"
import { pageVariants, pageTransition, staggerContainer, staggerItem, springs, fadeScale } from "@/lib/animations"
import { useTabStore } from "@/store/use-tab-store"
import { cn } from "@/lib/cn"
import { lyraQueryKeys } from "@/lib/query-keys"
import {
  createNotebook, getNotebooks, updateNotebook,
  deleteNotebook, publishNotebook, unpublishNotebook,
} from "@/services/notebook-service"
import type { Notebook } from "@/types"
import { getNotebookIcon, pickDefaultIcon } from "@lyranote/ui/notebook-icons"

// ── Notebook card menu ────────────────────────────────────────────────────────

function NotebookCardMenu({
  notebook,
  onRename,
  onDelete,
  onTogglePublish,
}: {
  notebook: Notebook
  onRename: () => void
  onDelete: () => void
  onTogglePublish: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("touchstart", handlePointerDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("touchstart", handlePointerDown)
    }
  }, [open])

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  function hide() {
    closeTimer.current = setTimeout(() => setOpen(false), 130)
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-1.5 top-1.5 z-20"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) }}
        className="flex h-7 w-7 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--color-text-tertiary)" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.07)" }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
      >
        <MoreHorizontal size={15} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-8 w-36 overflow-hidden rounded-lg border p-1 shadow-lg"
            style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onRename() }}
            >
              <Pencil size={13} style={{ opacity: 0.6 }} />
              重命名
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onTogglePublish() }}
            >
              {notebook.isPublic
                ? <><GlobeLock size={13} style={{ opacity: 0.6 }} />取消公开</>
                : <><Globe size={13} style={{ opacity: 0.6 }} />公开</>
              }
            </button>
            <div className="my-0.5 mx-2 h-px" style={{ background: "var(--color-border)" }} />
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors text-red-400/70 hover:text-red-400"
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.08)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDelete() }}
            >
              <Trash2 size={13} style={{ opacity: 0.7 }} />
              删除
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Grid card ─────────────────────────────────────────────────────────────────

function NotebookGridCard({
  notebook,
  onOpen,
  onMutated,
}: {
  notebook: Notebook
  onOpen: (nb: Notebook) => void
  onMutated: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(notebook.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const renameRef = useRef<HTMLInputElement>(null)

  const iconId = notebook.coverEmoji || pickDefaultIcon(notebook.id)
  const Icon = getNotebookIcon(iconId)
  const wordLabel = notebook.wordCount >= 1000
    ? `${(notebook.wordCount / 1000).toFixed(1)}k 字`
    : `${notebook.wordCount} 字`

  useEffect(() => {
    if (renaming) renameRef.current?.select()
  }, [renaming])

  async function handleRename() {
    const title = renameValue.trim()
    if (!title || title === notebook.title) { setRenaming(false); return }
    setBusy(true)
    try {
      await updateNotebook(notebook.id, { title })
      onMutated()
    } finally {
      setBusy(false)
      setRenaming(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteNotebook(notebook.id)
      onMutated()
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  async function handleTogglePublish() {
    setBusy(true)
    try {
      if (notebook.isPublic) {
        await unpublishNotebook(notebook.id)
      } else {
        await publishNotebook(notebook.id)
      }
      onMutated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      variants={staggerItem}
      transition={springs.bouncy}
      whileTap={confirmDelete || renaming ? undefined : { scale: 0.98 }}
      whileHover={confirmDelete || renaming ? undefined : { y: -2, boxShadow: "0 8px 20px rgba(0,0,0,0.15)" }}
      onClick={() => { if (!renaming && !confirmDelete) onOpen(notebook) }}
      className="group relative flex flex-col min-h-[160px] rounded-xl border cursor-pointer transition-colors duration-200 hover:border-white/10 hover:bg-white/[0.02]"
      style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}
    >
      {/* Menu */}
      {!renaming && !confirmDelete && (
        <NotebookCardMenu
          notebook={notebook}
          onRename={() => { setRenameValue(notebook.title); setRenaming(true) }}
          onDelete={() => setConfirmDelete(true)}
          onTogglePublish={handleTogglePublish}
        />
      )}

      {/* Icon */}
      <div className="flex items-center px-4 pb-1 pt-3">
        <div className="flex h-8 w-8 items-center justify-center">
          <Icon size={28} />
        </div>
        {busy && <Loader2 size={12} className="ml-auto animate-spin" style={{ color: "var(--color-text-tertiary)" }} />}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-4 pb-3.5 pt-1 min-h-0">
        {/* Title / rename input */}
        <div className="flex items-center gap-2 pr-6">
          {renaming ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.stopPropagation(); void handleRename() }
                if (e.key === "Escape") setRenaming(false)
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent outline-none border-b text-[14px] font-medium pb-0.5"
              style={{ color: "var(--color-text-primary)", borderColor: "var(--color-accent)" }}
            />
          ) : (
            <h3 className="line-clamp-1 text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              {notebook.title}
            </h3>
          )}
          {!renaming && notebook.isPublic && (
            <span className="shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}>
              <Globe size={9} />
              公开
            </span>
          )}
        </div>

        {/* Rename actions */}
        {renaming && (
          <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => void handleRename()}
              className="text-[11px] px-2 py-0.5 rounded-md font-medium text-white"
              style={{ background: "var(--color-accent)" }}
            >
              确认
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="text-[11px] px-2 py-0.5 rounded-md"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              取消
            </button>
          </div>
        )}

        {/* Delete confirm */}
        {confirmDelete && (
          <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] flex-1" style={{ color: "var(--color-text-tertiary)" }}>确认删除？</p>
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="text-[11px] px-2 py-0.5 rounded-md font-medium text-red-400"
              style={{ background: "rgba(239,68,68,0.1)" }}
            >
              删除
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-[11px] px-2 py-0.5 rounded-md"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              取消
            </button>
          </div>
        )}

        {/* Description */}
        {!renaming && !confirmDelete && (
          notebook.summary || notebook.description ? (
            <p className="mt-1.5 line-clamp-2 shrink-0 text-[13px] leading-[1.5]"
              style={{ color: "var(--color-text-secondary)" }}>
              {notebook.summary || notebook.description}
            </p>
          ) : (
            <p className="mt-1.5 line-clamp-2 shrink-0 text-xs italic"
              style={{ color: "var(--color-text-tertiary)", opacity: 0.45 }}>
              暂无描述
            </p>
          )
        )}

        {/* Stats */}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-3 pb-0.5">
          <span className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            <FileText size={12} className="opacity-70" />
            {notebook.sourceCount} 个来源
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            <BookOpen size={12} className="opacity-70" />
            {notebook.noteCount} 篇笔记
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            <Hash size={12} className="opacity-70" />
            {wordLabel}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ── List row ──────────────────────────────────────────────────────────────────

function NotebookListRow({
  notebook,
  onOpen,
  onMutated,
}: {
  notebook: Notebook
  onOpen: (nb: Notebook) => void
  onMutated: () => void
}) {
  const iconId = notebook.coverEmoji || pickDefaultIcon(notebook.id)
  const Icon = getNotebookIcon(iconId)
  const wordLabel = notebook.wordCount >= 1000
    ? `${(notebook.wordCount / 1000).toFixed(1)}k 字`
    : `${notebook.wordCount} 字`

  async function handleTogglePublish() {
    if (notebook.isPublic) {
      await unpublishNotebook(notebook.id)
    } else {
      await publishNotebook(notebook.id)
    }
    onMutated()
  }

  return (
    <motion.div
      variants={staggerItem}
      transition={springs.bouncy}
      whileTap={{ scale: 0.995 }}
      whileHover={{ y: -1, boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}
      onClick={() => onOpen(notebook)}
      className="group relative flex items-center gap-3.5 px-4 py-3 rounded-xl border cursor-pointer transition-colors duration-200 hover:border-white/10 hover:bg-white/[0.02]"
      style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        <Icon size={26} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {notebook.title}
          </p>
          {notebook.isPublic && (
            <span className="shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}>
              <Globe size={9} />
              公开
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-4 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          <span className="flex items-center gap-1"><FileText size={11} className="opacity-60" />{notebook.sourceCount} 个来源</span>
          <span className="flex items-center gap-1"><BookOpen size={11} className="opacity-60" />{notebook.noteCount} 篇笔记</span>
          <span className="flex items-center gap-1"><Hash size={11} className="opacity-60" />{wordLabel}</span>
        </div>
      </div>
      <NotebookCardMenu
        notebook={notebook}
        onRename={() => {/* TODO: inline rename for list row */}}
        onDelete={async () => { await deleteNotebook(notebook.id); onMutated() }}
        onTogglePublish={handleTogglePublish}
      />
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function NotebooksPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const { openTab } = useTabStore()
  const queryClient = useQueryClient()
  const { data: notebooks = [], isLoading: loading } = useQuery({
    queryKey: lyraQueryKeys.notebooks.list(),
    queryFn: getNotebooks,
  })
  const createMutation = useMutation({
    mutationFn: ({ title }: { title: string }) => createNotebook(title),
    onSuccess: async (notebook) => {
      await queryClient.invalidateQueries({ queryKey: lyraQueryKeys.notebooks.all() })
      setShowNew(false)
      setNewTitle("")
      openTab({ type: "editor", title: notebook.title, meta: { notebookId: notebook.id } })
    },
  })

  async function handleCreate() {
    const title = newTitle.trim()
    if (!title || createMutation.isPending) return
    await createMutation.mutateAsync({ title })
  }

  function openNotebook(nb: Notebook) {
    openTab({ type: "editor", title: nb.title, meta: { notebookId: nb.id } })
  }

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: lyraQueryKeys.notebooks.all() })
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
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium text-white"
            style={{ background: "var(--color-accent)" }}
          >
            <Plus size={15} strokeWidth={2.5} />
            新建笔记本
          </motion.button>
        </div>
      </div>

      {/* New notebook input */}
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
            {createMutation.isPending && <Loader2 size={14} className="animate-spin text-[var(--color-accent)] shrink-0" />}
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
                ? "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4"
                : "flex flex-col gap-1.5"
            )}
          >
            {notebooks.map((nb: Notebook) =>
              viewMode === "list" ? (
                <NotebookListRow
                  key={nb.id}
                  notebook={nb}
                  onOpen={openNotebook}
                  onMutated={invalidate}
                />
              ) : (
                <NotebookGridCard
                  key={nb.id}
                  notebook={nb}
                  onOpen={openNotebook}
                  onMutated={invalidate}
                />
              )
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
