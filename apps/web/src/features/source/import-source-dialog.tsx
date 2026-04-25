"use client"

import { AnimatePresence, m } from "framer-motion"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2, FileText, Globe, Loader2, Upload, X, Link2, FolderOpen,
} from "lucide-react"
import { useRef, useState } from "react"
import { useTranslations } from "next-intl"

import { lyraQueryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { getNotebooks } from "@/services/notebook-service"
import { importSource, importGlobalSource } from "@/services/source-service"
import { useUiStore } from "@/store/use-ui-store"

interface Props {
  notebookId?: string
  /** When true, uploads go to the global knowledge base (no notebook binding) */
  global?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type Tab = "web" | "file"

export function ImportSourceDialog({ notebookId: notebookIdProp, global: isGlobal = false, open: openProp, onOpenChange }: Props) {
  const importDialogOpen = useUiStore((state) => state.importDialogOpen)
  const setImportDialogOpen = useUiStore((state) => state.setImportDialogOpen)
  const queryClient = useQueryClient()
  const t = useTranslations("importSource")
  const tc = useTranslations("common")

  const isOpen = openProp !== undefined ? openProp : importDialogOpen
  function setIsOpen(val: boolean) {
    if (onOpenChange) onOpenChange(val)
    else setImportDialogOpen(val)
  }

  const { data: notebooks = [] } = useQuery({
    queryKey: lyraQueryKeys.notebooks.list(),
    queryFn: getNotebooks,
    enabled: !notebookIdProp && !isGlobal && isOpen,
  })
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | undefined>()
  const notebookId = notebookIdProp ?? selectedNotebookId ?? notebooks[0]?.id

  const [tab, setTab] = useState<Tab>("web")
  const [urlInput, setUrlInput] = useState("")
  const [pendingUrls, setPendingUrls] = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadDone, setUploadDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleAddUrl() {
    const url = urlInput.trim()
    if (!url || pendingUrls.includes(url)) return
    setPendingUrls((prev) => [...prev, url])
    setUrlInput("")
  }

  function handleFileChange(files: FileList | null) {
    if (!files) return
    const arr = Array.from(files)
    setPendingFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...arr.filter((f) => !names.has(f.name))]
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    handleFileChange(e.dataTransfer.files)
  }

  function handleClose() {
    setIsOpen(false)
    setUrlInput("")
    setPendingUrls([])
    setPendingFiles([])
    setUploadError(null)
    setUploadDone(false)
  }

  async function handleImport() {
    if (!isGlobal && !notebookId) return
    setIsUploading(true)
    setUploadError(null)
    try {
      if (isGlobal) {
        await Promise.all([
          ...pendingUrls.map((url) => importGlobalSource({ type: "url", url, title: url })),
          ...pendingFiles.map((file) => importGlobalSource({ type: "file", file })),
        ])
      } else {
        await Promise.all([
          ...pendingUrls.map((url) => importSource(notebookId!, { type: "url", url, title: url })),
          ...pendingFiles.map((file) => importSource(notebookId!, { type: "file", file })),
        ])
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: lyraQueryKeys.sources.list({ notebookId, scope: "notebook" }),
        }),
        queryClient.invalidateQueries({ queryKey: ["all-sources"] }),
        queryClient.invalidateQueries({ queryKey: ["global-sources"] }),
      ])
      setUploadDone(true)
      setTimeout(handleClose, 1000)
    } catch {
      setUploadError(t("uploadFailed"))
    } finally {
      setIsUploading(false)
    }
  }

  const hasContent = pendingUrls.length > 0 || pendingFiles.length > 0
  const canImport = hasContent && (isGlobal || !!notebookId)

  return (
    <AnimatePresence>
      {isOpen && (
        // Backdrop
        <m.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          {/* Panel */}
          <m.div
            key="panel"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 26, mass: 0.7 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/30"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border/40 px-6 py-5">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">{tc("addSource")}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {isGlobal
                    ? t("globalDesc")
                    : notebookIdProp
                    ? t("notebookDesc")
                    : t("selectNotebookDesc")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="ml-4 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {/* Notebook picker — hidden in global mode */}
              {!isGlobal && !notebookIdProp && notebooks.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("targetNotebook")}</label>
                  <select
                    className="w-full rounded-xl border border-border/50 bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                    value={selectedNotebookId ?? notebooks[0]?.id ?? ""}
                    onChange={(e) => setSelectedNotebookId(e.target.value)}
                  >
                    {notebooks.map((nb) => (
                      <option key={nb.id} value={nb.id}>{nb.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tab switcher */}
              <div className="flex rounded-xl border border-border/40 bg-muted/40 p-1 gap-1">
                {([
                  { key: "web" as Tab, label: t("webLink"), icon: Link2 },
                  { key: "file" as Tab, label: t("localFile"), icon: FolderOpen },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={cn(
                      "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      tab === key
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="min-h-[180px]">
                <AnimatePresence mode="wait">
                  {tab === "web" ? (
                    <m.div
                      key="web"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-3"
                    >
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                          <input
                            autoFocus
                            type="url"
                            placeholder={t("webPlaceholder")}
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddUrl() }}
                            className="w-full rounded-xl border border-border/40 bg-background py-2.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/40 transition-colors focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={!urlInput.trim()}
                          onClick={handleAddUrl}
                          className="rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                        >
                          {t("addBtn")}
                        </button>
                      </div>

                      <AnimatePresence>
                        {pendingUrls.length > 0 ? (
                          <m.ul
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="space-y-1 overflow-hidden rounded-xl border border-border/40 bg-muted/30 p-2"
                          >
                            {pendingUrls.map((url) => (
                              <m.li
                                key={url}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 6 }}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
                              >
                                <Globe size={12} className="flex-shrink-0 text-sky-400" />
                                <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{url}</span>
                                <button
                                  type="button"
                                  onClick={() => setPendingUrls((p) => p.filter((u) => u !== url))}
                                  className="flex-shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <X size={11} />
                                </button>
                              </m.li>
                            ))}
                          </m.ul>
                        ) : (
                          <m.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="py-6 text-center text-xs text-muted-foreground/50"
                          >
                            {t("webHint")}
                          </m.p>
                        )}
                      </AnimatePresence>
                    </m.div>
                  ) : (
                    <m.div
                      key="file"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-3"
                    >
                      <div
                        className={cn(
                          "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all duration-200",
                          isDragging
                            ? "border-primary/70 bg-primary/5 scale-[1.01]"
                            : "border-border/50 hover:border-border/80 hover:bg-muted/20"
                        )}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                      >
                        <div className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
                          isDragging ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          <Upload size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{t("dropFiles")}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground/60">
                            {t("fileHint")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-lg border border-border/50 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                        >
                          {t("browseFiles")}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.txt,.md,.markdown,.mp3,.mp4,.wav,text/markdown"
                          className="hidden"
                          onChange={(e) => handleFileChange(e.target.files)}
                        />
                      </div>

                      <AnimatePresence>
                        {pendingFiles.length > 0 && (
                          <m.ul
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="space-y-1 overflow-hidden rounded-xl border border-border/40 bg-muted/30 p-2"
                          >
                            {pendingFiles.map((file) => (
                              <m.li
                                key={file.name}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 6 }}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
                              >
                                <FileText size={12} className="flex-shrink-0 text-amber-400" />
                                <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{file.name}</span>
                                <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
                                  {(file.size / 1024).toFixed(0)} KB
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPendingFiles((p) => p.filter((f) => f.name !== file.name))}
                                  className="flex-shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <X size={11} />
                                </button>
                              </m.li>
                            ))}
                          </m.ul>
                        )}
                      </AnimatePresence>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-border/30 pt-4">
                <AnimatePresence>
                  {uploadError && (
                    <m.p
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-destructive"
                    >
                      {uploadError}
                    </m.p>
                  )}
                  {!uploadError && <span />}
                </AnimatePresence>

                <div className="flex gap-2">
                    <button
                    type="button"
                    onClick={handleClose}
                    disabled={isUploading}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                  >
                    {tc("cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={!canImport || isUploading}
                    onClick={handleImport}
                    className={cn(
                      "flex min-w-[90px] items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all",
                      uploadDone
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
                    )}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        {t("uploading")}
                      </>
                    ) : uploadDone ? (
                      <>
                        <CheckCircle2 size={13} />
                        {t("imported")}
                      </>
                    ) : (
                      t("importSource")
                    )}
                  </button>
                </div>
              </div>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
