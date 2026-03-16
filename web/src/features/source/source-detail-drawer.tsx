"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, m } from "framer-motion"
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Hash,
  Headphones,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { useToast } from "@/hooks/use-toast"
import { REFETCH_INTERVAL_FAST, TRUNCATE_PREVIEW } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { getNotebooks } from "@/services/notebook-service"
import {
  type ChunkStrategy,
  deleteSource,
  getChunks,
  rechunkSource,
  updateSource,
} from "@/services/source-service"
import type { Source } from "@/types"
import { useTranslations } from "next-intl"

// ── Static config ─────────────────────────────────────────────────────────────

interface StrategyInfo { labelKey: string; descKey: string; size: number; overlap: number }

const STRATEGIES: Record<ChunkStrategy, StrategyInfo> = {
  coarse:   { labelKey: "chunkCoarse", descKey: "chunkCoarseDesc", size: 600, overlap: 100 },
  standard: { labelKey: "chunkStandard", descKey: "chunkStandardDesc", size: 512, overlap: 64 },
  fine:     { labelKey: "chunkFine", descKey: "chunkFineDesc", size: 256, overlap: 32 },
}

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  pdf: FileText, web: Globe, audio: Headphones, doc: FileText,
}
const TYPE_COLOR: Record<string, string> = {
  pdf:   "text-rose-400 bg-rose-500/10",
  web:   "text-sky-400 bg-sky-500/10",
  audio: "text-violet-400 bg-violet-500/10",
  doc:   "text-amber-400 bg-amber-500/10",
}

// ── ChunkItem ─────────────────────────────────────────────────────────────────

function ChunkItem({
  chunk,
  idx,
}: {
  chunk: { id: string; chunk_index: number; content: string; token_count: number | null }
  idx: number
}) {
  const tc = useTranslations("common")
  const [expanded, setExpanded] = useState(false)
  const preview = chunk.content.slice(0, TRUNCATE_PREVIEW)
  const hasMore = chunk.content.length > TRUNCATE_PREVIEW

  return (
    <div className="rounded-xl border border-border/30 bg-muted/20 p-3 transition-colors hover:bg-muted/40">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-[10px] font-bold text-primary">
          {idx + 1}
        </span>
        {chunk.token_count != null && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
            <Hash size={9} />
            {chunk.token_count} 词
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-foreground/75">
        {expanded ? chunk.content : preview}
        {hasMore && !expanded && "…"}
      </p>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 flex items-center gap-0.5 text-[11px] text-primary/70 hover:text-primary"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {expanded ? tc("collapse") : tc("expand")}
        </button>
      )}
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────

interface Props {
  source: Source | null
  onClose: () => void
}

export function SourceDetailDrawer({ source, onClose }: Props) {
  const t = useTranslations("sourceDetail")
  const tc = useTranslations("common")
  const queryClient = useQueryClient()
  const { success: toastOk, error: toastErr } = useToast()
  const [tab, setTab] = useState<"chunks" | "settings">("chunks")
  const [selectedStrategy, setSelectedStrategy] = useState<ChunkStrategy>("standard")
  const [selectedNotebookId, setSelectedNotebookId] = useState<string>("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Ensure portal target exists (avoid SSR mismatch)
  useEffect(() => { setMounted(true) }, [])

  // Close on Escape key
  useEffect(() => {
    if (!source) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [source, onClose])

  const { data: chunks = [], isLoading: chunksLoading } = useQuery({
    queryKey: ["chunks", source?.id],
    queryFn: () => getChunks(source!.id),
    enabled: !!source && tab === "chunks",
    refetchInterval: source?.status === "processing" || source?.status === "pending" ? REFETCH_INTERVAL_FAST : false,
  })

  const { data: notebooks = [] } = useQuery({
    queryKey: ["notebooks"],
    queryFn: getNotebooks,
    enabled: tab === "settings",
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["all-sources"] })
    queryClient.invalidateQueries({ queryKey: ["chunks", source?.id] })
    if (source) queryClient.invalidateQueries({ queryKey: ["sources", source.notebookId] })
  }

  const rechunkMut = useMutation({
    mutationFn: () => rechunkSource(source!.id, selectedStrategy),
    onSuccess: () => { invalidate(); setTab("chunks"); toastOk("重新分块已提交") },
    onError: () => toastErr("重新分块失败"),
  })

  const bindMut = useMutation({
    mutationFn: () => updateSource(source!.id, { notebook_id: selectedNotebookId }),
    onSuccess: () => { invalidate(); setSelectedNotebookId(""); toastOk("知识库已更新") },
    onError: () => toastErr("更新知识库失败"),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteSource(source!.id),
    onSuccess: () => { invalidate(); onClose(); toastOk("来源已删除") },
    onError: () => toastErr("删除失败"),
  })

  const Icon = TYPE_ICON[source?.type ?? ""] ?? FileText
  const colorCls = TYPE_COLOR[source?.type ?? ""] ?? TYPE_COLOR.doc
  const isProcessing = source?.status === "processing" || source?.status === "pending"

  // ── Portal content ──────────────────────────────────────────────────────────
  const content = (
    <AnimatePresence>
      {source && (
        <>
          {/* Backdrop */}
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer panel */}
          <m.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 34, mass: 0.8 }}
            className="fixed right-0 top-0 z-[70] flex h-screen w-[420px] flex-col overflow-hidden border-l border-border/40 bg-background shadow-2xl"
          >
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex-shrink-0 border-b border-border/30 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className={cn("mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", colorCls)}>
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{source.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {source.status === "indexed" ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                        <CheckCircle2 size={10} /> 已索引
                      </span>
                    ) : source.status === "failed" ? (
                      <span className="flex items-center gap-1 text-[11px] text-red-400">
                        <X size={10} /> 处理失败
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-amber-400">
                        <Loader2 size={10} className="animate-spin" /> 处理中
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground/50">·</span>
                    <span className="text-[11px] text-muted-foreground/60">{t("chunkCount", { count: chunks.length })}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <X size={15} />
                </button>
              </div>

              {source.summary && (
                <p className="mt-3 rounded-xl bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {source.summary}
                </p>
              )}

              {/* Tab bar */}
              <div className="mt-4 flex gap-0.5 rounded-lg border border-border/30 bg-muted/20 p-0.5">
                {(["chunks", "settings"] as const).map((tabKey) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setTab(tabKey)}
                    className={cn(
                      "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                      tab === tabKey ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tabKey === "chunks" ? t("splitChunks") : t("splitSettings")}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Body ───────────────────────────────────────────── */}
            <div className="no-scrollbar flex-1 overflow-y-auto px-5 py-4">
              {/* Chunks tab */}
              {tab === "chunks" && (
                <div className="space-y-2">
                  {chunksLoading && (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 size={20} className="animate-spin text-muted-foreground/40" />
                    </div>
                  )}
                  {!chunksLoading && isProcessing && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Loader2 size={20} className="animate-spin text-amber-400" />
                      <p className="mt-3 text-sm text-muted-foreground">{t("processing")}</p>
                    </div>
                  )}
                  {!chunksLoading && source.status === "failed" && (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/15 bg-red-500/5 px-5 py-8 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                        <X size={18} className="text-red-400" />
                      </div>
                      <div>
                        <p className="mb-1 text-sm font-medium text-red-400">{t("processingFailed")}</p>
                        <p className="text-[12px] leading-relaxed text-muted-foreground/60">
                          {source.summary ?? t("processingFailedDesc")}
                        </p>
                      </div>
                    </div>
                  )}
                  {!chunksLoading && !isProcessing && source.status !== "failed" && chunks.length === 0 && (
                    <p className="py-12 text-center text-sm text-muted-foreground">{t("noChunks")}</p>
                  )}
                  {chunks.map((chunk, i) => (
                    <ChunkItem key={chunk.id} chunk={chunk} idx={i} />
                  ))}
                </div>
              )}

              {/* Settings tab */}
              {tab === "settings" && (
                <div className="space-y-3 pb-6">

                  {/* ── 重新切割 ─────────────────────────────────────── */}
                  <section className="overflow-hidden rounded-2xl border border-border/30 bg-muted/20">
                    {/* Section header */}
                    <div className="flex items-center gap-2.5 border-b border-border/30 px-4 py-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                        <RefreshCw size={12} className="text-primary/80" />
                      </div>
                      <span className="text-[13px] font-semibold text-foreground/90">{t("chunkStrategy")}</span>
                      <span className="ml-auto rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground/50">
                        选择后点击应用
                      </span>
                    </div>

                    {/* Strategy grid */}
                    <div className="grid grid-cols-3 gap-2 p-3">
                      {(Object.entries(STRATEGIES) as [ChunkStrategy, StrategyInfo][]).map(([key, info]) => {
                        const active = selectedStrategy === key
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedStrategy(key)}
                            className={cn(
                              "relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all",
                              active
                                ? "border-primary/40 bg-primary/10 shadow-sm shadow-primary/10"
                                : "border-border/30 bg-muted/20 hover:border-border/50 hover:bg-muted/40"
                            )}
                          >
                            {/* Active indicator dot */}
                            {active && (
                              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                            {/* Size pill */}
                            <span className={cn(
                              "rounded-lg px-2.5 py-1 text-[13px] font-bold tabular-nums",
                              active ? "bg-primary/20 text-primary" : "bg-accent/60 text-foreground/60"
                            )}>
                              {info.size}
                            </span>
                            <span className={cn(
                              "text-[12px] font-medium leading-tight",
                              active ? "text-foreground" : "text-foreground/70"
                            )}>
                              {t(info.labelKey)}
                            </span>
                            <span className={cn(
                              "text-[10px] leading-snug",
                              active ? "text-primary/60" : "text-muted-foreground/40"
                            )}>
                              重叠 {info.overlap}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Description of selected */}
                    <div className="mx-3 mb-3 rounded-xl bg-muted/30 px-3 py-2">
                      <p className="text-[12px] leading-relaxed text-muted-foreground/60">
                        {t(STRATEGIES[selectedStrategy].descKey)}
                      </p>
                    </div>

                    {/* Apply button */}
                    <div className="border-t border-border/30 px-3 py-3">
                      <button
                        type="button"
                        disabled={rechunkMut.isPending}
                        onClick={() => rechunkMut.mutate()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/15 py-2.5 text-[13px] font-medium text-primary transition-all hover:bg-primary/22 disabled:opacity-50 active:scale-[0.99]"
                      >
                        {rechunkMut.isPending
                          ? <><Loader2 size={13} className="animate-spin" />{t("splitting")}</>
                          : <><RefreshCw size={13} />{t("applyAndSplit")}</>}
                      </button>
                      <AnimatePresence>
                        {rechunkMut.isSuccess && (
                          <m.p
                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                            className="flex items-center justify-center gap-1.5 text-[12px] text-emerald-400"
                          >
                            <CheckCircle2 size={12} /> 已加入队列，片段将很快更新
                          </m.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </section>

                  {/* ── 绑定笔记本 ───────────────────────────────────── */}
                  <section className="overflow-hidden rounded-2xl border border-border/30 bg-muted/20">
                    <div className="flex items-center gap-2.5 border-b border-border/30 px-4 py-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/10">
                        <BookOpen size={12} className="text-violet-400/80" />
                      </div>
                      <span className="text-[13px] font-semibold text-foreground/90">{t("bindToNotebook")}</span>
                    </div>
                    <div className="p-3">
                      <p className="mb-2.5 text-[12px] leading-relaxed text-muted-foreground/50">
                        绑定后，此来源将成为该笔记本专属知识，AI 问答时优先检索。
                      </p>
                      <div className="relative mb-2.5">
                        <BookOpen size={12} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                        <select
                          value={selectedNotebookId}
                          onChange={(e) => setSelectedNotebookId(e.target.value)}
                          className="w-full appearance-none rounded-xl border border-border/40 bg-card py-2.5 pl-9 pr-4 text-[13px] text-foreground/80 focus:border-primary/35 focus:outline-none"
                        >
                          <option value="">{t("selectNotebook")}</option>
                          {notebooks.map((nb) => (
                            <option key={nb.id} value={nb.id}>{nb.title}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        disabled={!selectedNotebookId || bindMut.isPending}
                        onClick={() => bindMut.mutate()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500/12 py-2.5 text-[13px] font-medium text-violet-300 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99]"
                      >
                        {bindMut.isPending
                          ? <><Loader2 size={13} className="animate-spin" />{t("binding")}</>
                          : <><BookOpen size={13} />{t("confirmBind")}</>}
                      </button>
                      <AnimatePresence>
                        {bindMut.isSuccess && (
                          <m.p
                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                            className="flex items-center justify-center gap-1.5 text-[12px] text-emerald-400"
                          >
                            <CheckCircle2 size={12} /> 已成功绑定到笔记本
                          </m.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </section>

                  {/* ── 危险操作 ─────────────────────────────────────── */}
                  <section className="overflow-hidden rounded-2xl border border-red-500/[0.12] bg-red-500/[0.03]">
                    <div className="flex items-center gap-2.5 border-b border-red-500/[0.08] px-4 py-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/10">
                        <Trash2 size={12} className="text-red-400/80" />
                      </div>
                      <span className="text-[13px] font-semibold text-red-400/80">{t("dangerZone")}</span>
                    </div>
                    <div className="p-3">
                      <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground/50">
                        {t.rich("deleteWarning", {
                          danger: (chunks) => <span className="text-red-400/70"> {chunks}</span>,
                        })}
                      </p>

                      <AnimatePresence mode="wait">
                        {!confirmDelete ? (
                          <m.button
                            key="delete-btn"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/6 py-2.5 text-[13px] font-medium text-red-400/70 transition-all hover:border-red-500/35 hover:bg-red-500/12 hover:text-red-400 active:scale-[0.99]"
                          >
                            <Trash2 size={13} /> 删除此来源
                          </m.button>
                        ) : (
                          <m.div
                            key="confirm-panel"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ type: "spring", stiffness: 400, damping: 28 }}
                            className="overflow-hidden rounded-xl border border-red-500/25 bg-card"
                          >
                            <div className="h-px w-full bg-gradient-to-r from-red-500/60 via-red-400/20 to-transparent" />
                            <div className="p-3">
                              <p className="mb-1 text-[13px] font-semibold text-foreground">{t("confirmDeleteQuestion")}</p>
                              <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground/55">
                                <span className="font-medium text-foreground/70">{source.title}</span>
                                {" "}及其所有切割片段将被永久清除。
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(false)}
                                  className="flex-1 rounded-lg border border-border/50 bg-muted/40 py-2 text-[12px] text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                                >
                                  {tc("cancel")}
                                </button>
                                <button
                                  type="button"
                                  disabled={deleteMut.isPending}
                                  onClick={() => deleteMut.mutate()}
                                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/20 py-2 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50"
                                >
                                  {deleteMut.isPending
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <><Trash2 size={11} />{t("permanentDelete")}</>}
                                </button>
                              </div>
                            </div>
                          </m.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </section>

                </div>
              )}
            </div>
          </m.aside>
        </>
      )}
    </AnimatePresence>
  )

  // Render via portal so fixed positioning is always relative to viewport,
  // regardless of any CSS transform on ancestor elements.
  if (!mounted) return null
  return createPortal(content, document.body)
}
