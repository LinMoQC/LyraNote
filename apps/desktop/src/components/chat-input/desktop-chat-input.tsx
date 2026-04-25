import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowUp, Book, Check, ChevronDown, ChevronRight, FlaskConical, Lightbulb, List, FileSearch, FileText, GitCompare, Loader2, Paperclip, Plus, Radar, Sparkles, Square, X } from "lucide-react"

import { ChatComposer } from "@/components/chat-input/chat-composer"
import { lyraQueryKeys } from "@/lib/query-keys"
import { getNotebooks } from "@/services/notebook-service"
import { uploadTempFile } from "@/services/upload-service"

const MOCK_TOOLS = [
  { id: "toolSummarize", label: "总结", icon: FileText },
  { id: "toolInsights", label: "提取洞察", icon: Radar },
  { id: "toolOutline", label: "生成大纲", icon: List },
  { id: "toolDeepRead", label: "深度阅读", icon: FileSearch },
  { id: "toolCompare", label: "观点对比", icon: GitCompare },
]

export const DesktopChatInput = forwardRef<DesktopChatInputHandle, DesktopChatInputProps>(
  function DesktopChatInput({ placeholder, onSubmit, streaming = false, onCancel }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const drRef = useRef<HTMLDivElement>(null)
    const toolsRef = useRef<HTMLDivElement>(null)
    const notebooksRef = useRef<HTMLDivElement>(null)

    const [input, setInput] = useState("")
    const [attachments, setAttachments] = useState<LocalAttachment[]>([])
    const [menuOpen, setMenuOpen] = useState(false)
    const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
    const [notebooksMenuOpen, setNotebooksMenuOpen] = useState(false)
    const [isDeepResearch, setIsDeepResearch] = useState(false)
    const [drMode, setDrMode] = useState<"quick" | "deep">("quick")
    const [drDropdownOpen, setDrDropdownOpen] = useState(false)
    const [thinkingEnabled, setThinkingEnabled] = useState(false)
    const [selectedTool, setSelectedTool] = useState<ToolOption | null>(null)
    const [selectedNotebook, setSelectedNotebook] = useState<NotebookOption | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const { data: notebooks = [] } = useQuery({
      queryKey: lyraQueryKeys.notebooks.list(),
      queryFn: getNotebooks,
      staleTime: 60_000,
    })

    useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        const node = event.target as Node
        if (
          menuRef.current && !menuRef.current.contains(node) &&
          (!drRef.current || !drRef.current.contains(node)) &&
          (!toolsRef.current || !toolsRef.current.contains(node)) &&
          (!notebooksRef.current || !notebooksRef.current.contains(node))
        ) {
          setMenuOpen(false)
          setToolsMenuOpen(false)
          setNotebooksMenuOpen(false)
          setDrDropdownOpen(false)
        }
      }

      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      clear: () => {
        setInput("")
        setAttachments([])
      },
      getDraft: () => ({
        content: input,
        attachments,
      }),
      setDraft: (draft) => {
        setInput(draft.content)
        setAttachments(draft.attachments)
      },
    }), [attachments, input])

    const isUploadingAttachment = attachments.some((attachment) => attachment.isUploading)
    const isSubmitDisabled =
      isSubmitting ||
      isUploadingAttachment ||
      (!streaming && !input.trim() && attachments.length === 0)

    async function handleFilesSelected(files: File[]) {
      if (!files.length) return

      const wrapped = files.map((file) => ({
        localId: crypto.randomUUID(),
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        isUploading: true,
      } satisfies LocalAttachment))

      setAttachments((prev) => [...prev, ...wrapped])

      await Promise.all(wrapped.map(async (attachment) => {
        try {
          const serverId = await uploadTempFile(attachment.file)
          setAttachments((prev) => prev.map((item) => item.localId === attachment.localId ? { ...item, serverId, isUploading: false } : item))
        } catch {
          setAttachments((prev) => prev.map((item) => item.localId === attachment.localId ? { ...item, isUploading: false } : item))
        }
      }))
    }

    function removeAttachment(localId: string) {
      setAttachments((prev) => {
        const target = prev.find((attachment) => attachment.localId === localId)
        if (target) revokeAttachmentPreview(target)
        return prev.filter((attachment) => attachment.localId !== localId)
      })
    }

    async function handleSubmit() {
      if (streaming) {
        onCancel?.()
        return
      }

      if (isSubmitDisabled) return

      const payload = { content: input.trim(), attachments }
      setInput("")
      setAttachments([])

      setIsSubmitting(true)
      try {
        await onSubmit(payload)
      } finally {
        setIsSubmitting(false)
      }
    }

    const attachmentsBar = useMemo(() => {
      if (attachments.length === 0) return undefined
      return (
        <div className="flex flex-wrap items-end gap-3 px-5 pt-4 pb-1">
          {attachments.map((attachment) => (
            <AttachmentItem
              key={attachment.localId}
              attachment={attachment}
              onRemove={() => removeAttachment(attachment.localId)}
            />
          ))}
        </div>
      )
    }, [attachments])

    return (
      <ChatComposer
        value={input}
        onChange={setInput}
        onSubmit={() => {
          void handleSubmit()
        }}
        placeholder={placeholder}
        textareaRef={textareaRef}
        isSubmitDisabled={isSubmitDisabled}
        submitOnEnter={!streaming}
        topContent={attachmentsBar}
        textareaClassName={attachments.length > 0 ? "pt-2" : "pt-4"}
        toolbarLeft={(
          <div className="relative flex items-center gap-1.5" ref={menuRef}>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files || [])
                event.target.value = ""
                void handleFilesSelected(files)
              }}
            />
            <button
              onClick={() => {
                setMenuOpen(!menuOpen)
                setToolsMenuOpen(false)
                setNotebooksMenuOpen(false)
              }}
              className="flex items-center justify-center w-[30px] h-[30px] rounded-full border-[1.5px] border-[rgba(255,255,255,0.12)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[#ffffff12] transition-colors"
            >
              <Plus size={15} strokeWidth={1.5} style={{ transform: menuOpen ? "rotate(45deg)" : "rotate(0deg)", transition: "transform 0.2s ease-out" }} />
            </button>

            {isDeepResearch && (
              <div ref={drRef} className="group relative flex items-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-sky-400/15 hover:text-sky-400">
                <button
                  type="button"
                  onClick={() => setIsDeepResearch(false)}
                  className="relative flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full [&:hover_.cancel-hover-bg]:bg-sky-400/20"
                >
                  <span className="cancel-hover-bg pointer-events-none absolute inset-0 m-auto h-[22px] w-[22px] rounded-full transition-colors" />
                  <FlaskConical size={14} className="text-[var(--color-text-tertiary)] transition-opacity group-hover:pointer-events-none group-hover:opacity-0" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <X size={14} className="text-[var(--color-text-tertiary)] opacity-0 transition-opacity group-hover:text-sky-400/80 group-hover:opacity-100" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrDropdownOpen((value) => !value)}
                  className="flex flex-1 items-center gap-1.5 py-1.5 pl-0.5 pr-2.5 text-[13px] transition-colors min-w-0"
                >
                  <span className="truncate">深度研究</span>
                  <ChevronDown size={14} className={`flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:text-sky-400 ${drDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {drDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute bottom-full left-0 z-50 mb-2 w-32 overflow-hidden rounded-[14px] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-1.5 shadow-xl"
                    >
                      <p className="px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)] opacity-70">版本</p>
                      <button onClick={() => { setDrMode("quick"); setDrDropdownOpen(false) }} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--color-text-primary)] hover:bg-[#ffffff12]">
                        Quick {drMode === "quick" && <Check size={12} className="text-[var(--color-accent)]" />}
                      </button>
                      <button onClick={() => { setDrMode("deep"); setDrDropdownOpen(false) }} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--color-text-primary)] hover:bg-[#ffffff12]">
                        Deep {drMode === "deep" && <Check size={12} className="text-[var(--color-accent)]" />}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {thinkingEnabled && (
              <button
                type="button"
                onClick={() => setThinkingEnabled(false)}
                className="group flex items-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-sky-400/15 hover:text-sky-400"
              >
                <span className="relative flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center [&_.cancel-hover-bg]:transition-colors group-hover:[&_.cancel-hover-bg]:bg-sky-400/20">
                  <span className="cancel-hover-bg pointer-events-none absolute inset-0 m-auto h-[22px] w-[22px] rounded-full" />
                  <Lightbulb size={14} className="text-[var(--color-text-tertiary)] transition-opacity group-hover:pointer-events-none group-hover:opacity-0" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <X size={14} className="text-[var(--color-text-tertiary)] opacity-0 transition-opacity group-hover:text-sky-400/80 group-hover:opacity-100" />
                  </span>
                </span>
                <span className="py-1.5 pl-0 pr-2.5 text-[13px]">思考模式</span>
              </button>
            )}

            {selectedTool && (
              <button
                type="button"
                onClick={() => setSelectedTool(null)}
                className="group flex items-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-sky-400/15 hover:text-sky-400"
              >
                <span className="relative flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center [&_.cancel-hover-bg]:transition-colors group-hover:[&_.cancel-hover-bg]:bg-sky-400/20">
                  <span className="cancel-hover-bg pointer-events-none absolute inset-0 m-auto h-[22px] w-[22px] rounded-full" />
                  <selectedTool.icon size={14} className="text-[var(--color-text-tertiary)] transition-opacity group-hover:pointer-events-none group-hover:opacity-0" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <X size={14} className="text-[var(--color-text-tertiary)] opacity-0 transition-opacity group-hover:text-sky-400/80 group-hover:opacity-100" />
                  </span>
                </span>
                <span className="py-1.5 pl-0 pr-2.5 text-[13px]">{selectedTool.label}</span>
              </button>
            )}

            {selectedNotebook && (
              <button
                type="button"
                onClick={() => setSelectedNotebook(null)}
                className="group flex items-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-sky-400/15 hover:text-sky-400"
              >
                <span className="relative flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center [&_.cancel-hover-bg]:transition-colors group-hover:[&_.cancel-hover-bg]:bg-sky-400/20">
                  <span className="cancel-hover-bg pointer-events-none absolute inset-0 m-auto h-[22px] w-[22px] rounded-full" />
                  <Book size={14} className="text-[var(--color-text-tertiary)] transition-opacity group-hover:pointer-events-none group-hover:opacity-0" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <X size={14} className="text-[var(--color-text-tertiary)] opacity-0 transition-opacity group-hover:text-sky-400/80 group-hover:opacity-100" />
                  </span>
                </span>
                <span className="max-w-[120px] truncate py-1.5 pl-0 pr-2.5 text-[13px]">{selectedNotebook.title}</span>
              </button>
            )}

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute bottom-full left-2 z-50 mb-3 w-[200px] overflow-visible rounded-2xl p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border-strong)",
                  }}
                >
                  <button
                    onClick={() => { fileInputRef.current?.click(); setMenuOpen(false) }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[#ffffff0d] transition-colors"
                  >
                    <Paperclip size={15} strokeWidth={1.5} className="opacity-70" />
                    添加文件
                  </button>

                  <div className="my-1.5 mx-2 border-t border-[rgba(255,255,255,0.06)]" />

                  <button
                    onClick={() => { setIsDeepResearch(!isDeepResearch); setMenuOpen(false) }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[#ffffff0d] transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <FlaskConical size={15} strokeWidth={1.5} className="opacity-70" />
                      深度研究
                    </span>
                    {isDeepResearch && <span className="text-[var(--color-accent)]"><Check size={14} /></span>}
                  </button>

                  <button
                    onClick={() => { setThinkingEnabled(!thinkingEnabled); setMenuOpen(false) }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[#ffffff0d] transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <Lightbulb size={15} strokeWidth={1.5} className="opacity-70" />
                      思考模式
                    </span>
                    {thinkingEnabled && <span className="text-[var(--color-accent)]"><Check size={14} /></span>}
                  </button>

                  <div
                    ref={toolsRef}
                    className="relative"
                    onMouseEnter={() => setToolsMenuOpen(true)}
                    onMouseLeave={() => setToolsMenuOpen(false)}
                  >
                    <button onClick={() => setToolsMenuOpen(!toolsMenuOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[#ffffff0d] transition-colors group">
                      <span className="flex items-center gap-3">
                        <Sparkles size={15} strokeWidth={1.5} className="opacity-70" />
                        工具
                      </span>
                      <ChevronRight size={14} className="opacity-40 group-hover:opacity-70" />
                    </button>

                    <AnimatePresence>
                      {toolsMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, x: 6, scale: 0.98 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 6, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                          className="absolute bottom-[-8px] left-[105%] z-50 flex flex-col overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-xl w-[200px]"
                        >
                          <p className="px-4 pb-1.5 pt-3 text-[11px] font-semibold tracking-wider text-[var(--color-text-tertiary)] opacity-60">工具</p>
                          <div className="flex-1 py-1">
                            {MOCK_TOOLS.map((tool) => {
                              const active = selectedTool?.id === tool.id
                              return (
                                <div key={tool.id} className="px-1.5 py-0.5">
                                  <button
                                    onClick={() => { setSelectedTool(active ? null : tool); setToolsMenuOpen(false); setMenuOpen(false) }}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-medium rounded-xl transition-colors hover:text-[var(--color-text-primary)] hover:bg-[#ffffff0d] ${active ? "bg-[#ffffff0d] text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}`}
                                  >
                                    <span className="flex items-center gap-3">
                                      <tool.icon size={15} strokeWidth={1.5} className="opacity-70" />
                                      {tool.label}
                                    </span>
                                    {active && <span className="text-[var(--color-accent)]"><Check size={14} /></span>}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div
                    ref={notebooksRef}
                    className="relative"
                    onMouseEnter={() => setNotebooksMenuOpen(true)}
                    onMouseLeave={() => setNotebooksMenuOpen(false)}
                  >
                    <button onClick={() => setNotebooksMenuOpen(!notebooksMenuOpen)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[#ffffff0d] transition-colors group">
                      <span className="flex items-center gap-3">
                        <Book size={15} strokeWidth={1.5} className="opacity-70" />
                        笔记本
                      </span>
                      <ChevronRight size={14} className="opacity-40 group-hover:opacity-70" />
                    </button>

                    <AnimatePresence>
                      {notebooksMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, x: 6, scale: 0.98 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 6, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                          className="absolute bottom-[-8px] left-[105%] z-50 flex flex-col overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-xl w-[200px]"
                        >
                          <p className="px-4 pb-1.5 pt-3 text-[11px] font-semibold tracking-wider text-[var(--color-text-tertiary)] opacity-60">笔记本</p>
                          <div className="flex-1 py-1 max-h-[200px] overflow-y-auto no-scrollbar">
                            {notebooks.length === 0 ? (
                              <div className="px-4 py-3 text-xs text-[var(--color-text-tertiary)] opacity-70">
                                尚无笔记本
                              </div>
                            ) : (
                              notebooks.map((notebook: NotebookOption) => {
                                const active = selectedNotebook?.id === notebook.id
                                return (
                                  <div key={notebook.id} className="px-1.5 py-0.5">
                                    <button
                                      onClick={() => { setSelectedNotebook(active ? null : notebook); setNotebooksMenuOpen(false); setMenuOpen(false) }}
                                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-medium rounded-xl transition-colors hover:text-[var(--color-text-primary)] hover:bg-[#ffffff0d] ${active ? "bg-[#ffffff0d] text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}`}
                                    >
                                      <span className="flex items-center gap-3 truncate">
                                        <Book size={15} strokeWidth={1.5} className="opacity-70 flex-shrink-0" />
                                        <span className="truncate">{notebook.title}</span>
                                      </span>
                                      {active && <span className="text-[var(--color-accent)]"><Check size={14} /></span>}
                                    </button>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        toolbarRight={(
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              void handleSubmit()
            }}
            disabled={isSubmitDisabled && !streaming}
            className="flex items-center justify-center w-[30px] h-[30px] rounded-full text-[var(--color-text-secondary)] transition-all disabled:opacity-30 hover:bg-[#ffffff12] hover:text-[var(--color-text-primary)]"
          >
            {streaming
              ? <Square size={12} strokeWidth={0} fill="currentColor" className="rounded-[2px]" />
              : <ArrowUp size={18} strokeWidth={2} />}
          </motion.button>
        )}
      />
    )
  },
)

function AttachmentItem({ attachment, onRemove }: AttachmentItemProps) {
  const { file, isUploading, previewUrl } = attachment
  const isImage = file.type.startsWith("image/")

  if (isImage) {
    return (
      <div className="group relative h-[52px] w-[52px] shrink-0 rounded-xl">
        <div className="relative h-full w-full overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#ffffff0a]">
          {previewUrl && <img src={previewUrl} alt={file.name} className={`h-full w-full object-cover transition-opacity ${isUploading ? "opacity-40" : "opacity-100"}`} />}
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-white/70" />
            </div>
          )}
        </div>
        {!isUploading && (
          <button
            onClick={onRemove}
            className="absolute -right-2 -top-2 z-10 flex h-[20px] w-[20px] scale-0 items-center justify-center rounded-full bg-[#1e1e1e] border border-[rgba(255,255,255,0.12)] text-[var(--color-text-tertiary)] hover:text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100"
          >
            <X size={11} strokeWidth={3} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`flex h-8 items-center gap-2 bg-[#ffffff12] border border-[rgba(255,255,255,0.06)] rounded-lg px-2.5 text-[12px] text-[var(--color-text-secondary)] transition-opacity ${isUploading ? "opacity-60" : "opacity-100"}`}>
      {isUploading ? <Loader2 size={12} className="animate-spin shrink-0" /> : <Paperclip size={12} className="opacity-70 shrink-0" />}
      <span className="max-w-[140px] truncate">{file.name}</span>
      {!isUploading && (
        <button
          onClick={onRemove}
          className="text-[var(--color-text-tertiary)] hover:text-white transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function revokeAttachmentPreview(attachment: LocalAttachment) {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl)
  }
}

interface DesktopChatInputProps {
  placeholder: string
  onSubmit: (payload: DesktopChatInputSubmitPayload) => Promise<void> | void
  streaming?: boolean
  onCancel?: () => void
}

interface AttachmentItemProps {
  attachment: LocalAttachment
  onRemove: () => void
}

interface NotebookOption {
  id: string
  title: string
}

interface ToolOption {
  id: string
  label: string
  icon: typeof FileText
}

export interface LocalAttachment {
  localId: string
  file: File
  serverId?: string
  isUploading: boolean
  previewUrl?: string
}

export interface DesktopChatInputSubmitPayload {
  content: string
  attachments: LocalAttachment[]
}

export interface DesktopChatInputHandle {
  focus: () => void
  clear: () => void
  getDraft: () => DesktopChatInputSubmitPayload
  setDraft: (draft: DesktopChatInputSubmitPayload) => void
}
