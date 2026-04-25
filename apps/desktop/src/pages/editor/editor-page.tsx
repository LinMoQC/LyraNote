import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useEditor, EditorContent } from "@tiptap/react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { ChevronDown, Plus, Loader2, Check, BarChart3 } from "lucide-react"

import { desktopTiptapExtensions } from "@/lib/tiptap"
import { pageVariants, pageTransition, springs } from "@/lib/animations"
import { CopilotPanel, type CopilotMode } from "@/components/editor/copilot-panel"
import { EditorTOC } from "@/components/editor/editor-toc"
import { FloatingOrb } from "@/components/editor/floating-orb"
import { SelectionMenu } from "@/components/editor/selection-menu"
import { getDesktopNoteService } from "@/lib/api-client"
import { lyraQueryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/cn"
import type { Note } from "@lyranote/types"

interface EditorPageProps {
  title?: string
  notebookTitle?: string
  notebookId?: string
}

const FLOAT_W = 380
const FLOAT_H = 520

// ── Document meta bar (note picker + save status + char count) ───────────────

function DocumentMeta({
  notes,
  activeNoteId,
  noteTitle,
  charCount,
  saveStatus,
  creatingNote,
  onNoteSelect,
  onNoteCreate,
}: {
  notes: Note[]
  activeNoteId: string | null
  noteTitle: string
  charCount: number
  saveStatus: "idle" | "saving" | "saved"
  creatingNote: boolean
  onNoteSelect: (id: string) => void
  onNoteCreate: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    function handle(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [pickerOpen])

  return (
    <div className="flex items-center justify-between mb-6">
      {/* Note picker */}
      <div ref={pickerRef} className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 -ml-2 transition-colors text-[12px]",
            pickerOpen
              ? "bg-white/[0.07] text-white/70"
              : "text-white/35 hover:text-white/60 hover:bg-white/[0.05]",
          )}
        >
          <span className="truncate max-w-[240px]">{noteTitle || "无标题"}</span>
          <ChevronDown size={11} className="shrink-0 opacity-60" />
        </button>

        <AnimatePresence>
          {pickerOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="absolute left-0 top-full z-50 mt-1 w-[220px] overflow-hidden rounded-xl p-1"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border-strong)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
              }}
            >
              <div className="max-h-[240px] overflow-y-auto">
                {notes.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-[var(--color-text-tertiary)]">暂无笔记</p>
                ) : (
                  notes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => { onNoteSelect(note.id); setPickerOpen(false) }}
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
              <div className="my-1 mx-2 h-px" style={{ background: "var(--color-border)" }} />
              <button
                type="button"
                disabled={creatingNote}
                onClick={() => { onNoteCreate(); setPickerOpen(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[var(--color-text-tertiary)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-40"
              >
                {creatingNote ? <Loader2 size={13} className="animate-spin shrink-0" /> : <Plus size={13} className="shrink-0" />}
                新建笔记
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: save status + char count */}
      <div className="flex items-center gap-3">
        <AnimatePresence mode="wait">
          {saveStatus === "saving" && (
            <motion.span key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-[11px] text-white/25">
              保存中…
            </motion.span>
          )}
          {saveStatus === "saved" && (
            <motion.span key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-1 text-[11px] text-white/25">
              <Check size={10} />已保存
            </motion.span>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-1 text-[11px] text-white/20 tabular-nums">
          <BarChart3 size={11} />
          {charCount}
        </div>
      </div>
    </div>
  )
}

// ── Editor page ───────────────────────────────────────────────────────────────

export function EditorPage({ title = "无标题笔记本", notebookTitle, notebookId }: EditorPageProps) {
  const [noteTitle, setNoteTitle] = useState("")
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [copilotMode, setCopilotMode] = useState<CopilotMode>("floating")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [charCount, setCharCount] = useState(0)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLoadingContentRef = useRef(false)
  const queryClient = useQueryClient()

  const editor = useEditor({
    extensions: desktopTiptapExtensions,
    editorProps: { attributes: { class: "tiptap" } },
    onUpdate: ({ editor: e }) => {
      setCharCount(e.storage.characterCount?.characters?.() ?? 0)
      if (!isLoadingContentRef.current) scheduleAutoSave()
    },
  })

  const { data: notes = [] } = useQuery({
    queryKey: lyraQueryKeys.notes.list(notebookId ?? ""),
    queryFn: () => getDesktopNoteService().getNotes(notebookId!),
    enabled: !!notebookId,
  })

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null

  const updateMutation = useMutation({
    mutationFn: ({ noteId, payload }: { noteId: string; payload: { title?: string; content_json?: Record<string, unknown>; content_text?: string } }) =>
      getDesktopNoteService().updateNote(noteId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lyraQueryKeys.notes.list(notebookId ?? "") })
    },
  })

  const createMutation = useMutation({
    mutationFn: () => getDesktopNoteService().createNote(notebookId!, "无标题"),
    onSuccess: (note: Note) => {
      void queryClient.invalidateQueries({ queryKey: lyraQueryKeys.notes.list(notebookId ?? "") })
      setActiveNoteId(note.id)
    },
  })

  useEffect(() => {
    if (!activeNoteId && notes.length > 0) setActiveNoteId(notes[0].id)
  }, [notes, activeNoteId])

  useEffect(() => {
    if (!editor || !activeNote) return
    isLoadingContentRef.current = true
    const content = activeNote.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] }
    editor.commands.setContent(content, false)
    setNoteTitle(activeNote.title ?? "")
    setCharCount(editor.storage.characterCount?.characters?.() ?? 0)
    requestAnimationFrame(() => { isLoadingContentRef.current = false })
  }, [activeNoteId, editor]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleAutoSave = useCallback(() => {
    if (!activeNoteId || !editor) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus("saving")
    saveTimerRef.current = setTimeout(() => {
      updateMutation.mutate({
        noteId: activeNoteId,
        payload: {
          title: noteTitle,
          content_json: editor.getJSON() as Record<string, unknown>,
          content_text: editor.getText(),
        },
      })
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    }, 1500)
  }, [activeNoteId, editor, noteTitle, updateMutation])

  function handleTitleChange(value: string) {
    setNoteTitle(value)
    if (!activeNoteId || isLoadingContentRef.current) return
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current)
    setSaveStatus("saving")
    titleSaveTimerRef.current = setTimeout(() => {
      updateMutation.mutate({ noteId: activeNoteId, payload: { title: value } })
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    }, 800)
  }

  if (!editor) return null

  const isDocked = copilotMode === "docked"
  const showTOC = !copilotOpen || !isDocked

  function getEditorContent(): string {
    if (!editor) return ""
    return `标题：${noteTitle}\n\n${editor.getText()}`
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
      <div className="relative flex flex-1 min-h-0">
        {/* Editor */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="max-w-[720px] mx-auto px-12 py-10">
            {/* Document meta: note picker + save/char count */}
            <DocumentMeta
              notes={notes}
              activeNoteId={activeNoteId}
              noteTitle={noteTitle}
              charCount={charCount}
              saveStatus={saveStatus}
              creatingNote={createMutation.isPending}
              onNoteSelect={setActiveNoteId}
              onNoteCreate={() => createMutation.mutate()}
            />

            {/* Title */}
            <input
              value={noteTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="无标题"
              className="select-text w-full bg-transparent outline-none text-[2rem] font-bold text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] mb-6 leading-tight"
              style={{ fontFamily: "var(--font-sans)" }}
            />

            <div className="select-text">
              <EditorContent editor={editor} />
            </div>
          </div>
          <SelectionMenu editor={editor} />
        </div>

        {/* TOC panel — hidden when no headings (returns null from EditorTOC) */}
        <AnimatePresence>
          {showTOC && (
            <motion.div
              key="toc"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 180, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={springs.smooth}
              className="shrink-0 overflow-hidden"
            >
              <EditorTOC editor={editor} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Copilot — docked */}
        <AnimatePresence>
          {copilotOpen && isDocked && (
            <motion.div
              key="copilot-docked"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={springs.smooth}
              className="shrink-0 border-l flex flex-col overflow-hidden"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
            >
              <CopilotPanel
                notebookId={notebookId}
                notebookTitle={notebookTitle ?? title}
                onClose={() => setCopilotOpen(false)}
                getEditorContent={getEditorContent}
                mode={copilotMode}
                onModeChange={setCopilotMode}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Copilot — floating */}
        <AnimatePresence>
          {copilotOpen && !isDocked && (
            <motion.div
              key="copilot-floating"
              initial={{ opacity: 0, scale: 0.93, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 16 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="absolute bottom-4 right-4 z-20 flex flex-col overflow-hidden rounded-2xl border"
              style={{
                width: FLOAT_W,
                height: FLOAT_H,
                background: "var(--color-bg-elevated)",
                borderColor: "var(--color-border-strong)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)",
              }}
            >
              <CopilotPanel
                notebookId={notebookId}
                notebookTitle={notebookTitle ?? title}
                onClose={() => setCopilotOpen(false)}
                getEditorContent={getEditorContent}
                mode={copilotMode}
                onModeChange={setCopilotMode}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Orb */}
        <AnimatePresence>
          {!copilotOpen && <FloatingOrb onClick={() => setCopilotOpen(true)} />}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
