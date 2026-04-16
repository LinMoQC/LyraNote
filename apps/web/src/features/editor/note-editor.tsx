"use client";

/**
 * @file Tiptap 富文本编辑器
 * @description 基于 Tiptap 的笔记编辑器组件，提供丰富的格式工具栏、
 *              AI Ghost Text 行内补全、选中文本上下文菜单和自动保存功能。
 */

import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatePresence, m } from "framer-motion";
import { Pen, Search } from "lucide-react";
import { SelectionActionMenu } from "@/features/editor/selection-action-menu";
import type { EditorActionRequest } from "@/features/editor/editor-actions";
import { tiptapExtensions } from "@/lib/tiptap";
import { getInlineSuggestion } from "@/services/ai-service";
import { getNoteForNotebook, getNote, saveNote } from "@/services/note-service";
import { BlockHandle } from "./block-handle";

type SaveStatus = "idle" | "saving" | "saved" | "error"

const NUDGE_IDLE_MS = 45_000;
const MAX_NUDGES_PER_SESSION = 3;

type NoteEditorProps = {
  notebookId: string;
  noteId?: string | null;
  notebookTitle?: string;
  onEditorReady?: (editor: Editor) => void;
  onEditorAction?: (payload: EditorActionRequest) => void;
  onSaveStatusChange?: (status: SaveStatus) => void;
  /** 顶栏 / 笔记选择器与编辑器标题同步 */
  onActiveNoteTitleChange?: (title: string) => void;
  /** 保存成功后由工作区失效笔记列表等 */
  onNoteSaved?: () => void;
  refreshKey?: number;
  onToggleSources?: () => void;
  sourcesOpen?: boolean;
  isMobileLayout?: boolean;
};

export function NoteEditor({
  notebookId,
  noteId,
  notebookTitle,
  onEditorReady,
  onEditorAction,
  onSaveStatusChange,
  onActiveNoteTitleChange,
  onNoteSaved,
  refreshKey = 0,
  isMobileLayout = false,
}: NoteEditorProps) {
  const t = useTranslations("editor")
  const tNotebook = useTranslations("notebook")
  const [title, setTitle] = useState("")
  const titleFieldRef = useRef<HTMLTextAreaElement | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const onSaveStatusChangeRef = useRef(onSaveStatusChange);
  onSaveStatusChangeRef.current = onSaveStatusChange;
  const onActiveNoteTitleChangeRef = useRef(onActiveNoteTitleChange);
  onActiveNoteTitleChangeRef.current = onActiveNoteTitleChange;
  const onNoteSavedRef = useRef(onNoteSaved);
  onNoteSavedRef.current = onNoteSaved;
  const updateSaveStatus = useCallback((s: SaveStatus) => {
    setSaveStatus(s);
    onSaveStatusChangeRef.current?.(s);
  }, []);
  const noteIdRef = useRef<string | null>(null)
  const titleRef = useRef("")
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editor = useEditor({
    editorProps: {
      attributes: {
        class: "tiptap outline-none text-[var(--editor-font-size,16px)] font-medium leading-[var(--editor-line-height,1.85)] text-foreground min-h-[60vh] [&_p]:mb-[var(--editor-paragraph-spacing,0.8em)]"
      }
    },
    extensions: tiptapExtensions,
    immediatelyRender: false,
  });

  // Keep title ref in sync
  useEffect(() => { titleRef.current = title }, [title])

  // Notify parent when editor is ready
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  useEffect(() => {
    if (editor) onEditorReadyRef.current?.(editor);
  }, [editor]);

  // Load note: by explicit noteId if provided, otherwise load first note for notebook
  useEffect(() => {
    if (!editor) return
    const loadFn = noteId
      ? () => getNote(noteId)
      : () => getNoteForNotebook(notebookId)
    loadFn().then((note) => {
      if (!note) {
        noteIdRef.current = null
        setTitle("")
        titleRef.current = ""
        onActiveNoteTitleChangeRef.current?.("")
        editor.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] }, true)
        return
      }
      noteIdRef.current = note.id
      const nextTitle = note.title ?? ""
      setTitle(nextTitle)
      titleRef.current = nextTitle
      onActiveNoteTitleChangeRef.current?.(nextTitle)
      if (note.contentJson) {
        editor.commands.setContent(note.contentJson, true)
      }
    })
  }, [editor, notebookId, noteId, refreshKey])

  // Immediate save (used by Cmd+S)
  const saveNow = useCallback(async () => {
    if (!editor) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setSaveStatus("saving")
    try {
      const saved = await saveNote({
        notebookId,
        noteId: noteIdRef.current,
        title: titleRef.current.trim() || t("untitled"),
        contentJson: editor.getJSON() as Record<string, unknown>,
      })
      if (!noteIdRef.current) noteIdRef.current = saved.id
      onNoteSavedRef.current?.()
      updateSaveStatus("saved")
      savedTimerRef.current = setTimeout(() => updateSaveStatus("idle"), 2000)
    } catch {
      updateSaveStatus("error")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, notebookId, updateSaveStatus])

  // Debounced auto-save (triggered on every content change)
  const triggerSave = useCallback(() => {
    if (!editor) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      updateSaveStatus("saving")
      void saveNow()
    }, 3000)
  }, [editor, saveNow, updateSaveStatus])

  // Cmd+S / Ctrl+S shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        void saveNow()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [saveNow])

  // Debounced ghost-text trigger
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSuggestionRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      triggerSave();

      // Cancel any in-flight request
      pendingSuggestionRef.current?.abort();

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Clear existing ghost text on every keystroke
      editor.commands.clearGhostSuggestion();

      debounceTimerRef.current = setTimeout(async () => {
        const { from } = editor.state.selection;
        const context = editor.state.doc.textBetween(Math.max(0, from - 300), from);
        if (context.trim().length < 20) return;

        const controller = new AbortController();
        pendingSuggestionRef.current = controller;

        try {
          const suggestion = await getInlineSuggestion(context);
          if (controller.signal.aborted) return;
          // Re-check cursor hasn't moved
          const currentFrom = editor.state.selection.from;
          if (currentFrom === from) {
            editor.commands.setGhostSuggestion(suggestion, from);
          }
        } catch {
          // Ignore errors (e.g. network, abort)
        }
      }, 800);
    };

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [editor, triggerSave]);

  // ── AI Nudge: idle detection ──────────────────────────────
  const [showNudge, setShowNudge] = useState(false);
  const [nudgePos, setNudgePos] = useState({ top: 0, left: 0 });
  const nudgeCountRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdleTimer = useCallback(() => {
    setShowNudge(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!editor || nudgeCountRef.current >= MAX_NUDGES_PER_SESSION) return;

    const contentLen = editor.getText().length;
    if (contentLen < 30) return;

    idleTimerRef.current = setTimeout(() => {
      if (!editor || nudgeCountRef.current >= MAX_NUDGES_PER_SESSION) return;
      try {
        const { view } = editor;
        const coords = view.coordsAtPos(view.state.selection.from);
        const editorRect = view.dom.getBoundingClientRect();
        setNudgePos({
          top: coords.top - editorRect.top + 24,
          left: Math.min(coords.left - editorRect.left, editorRect.width - 260),
        });
        setShowNudge(true);
        nudgeCountRef.current += 1;
      } catch {
        // coords may fail if cursor is at doc boundary
      }
    }, NUDGE_IDLE_MS);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    const dismiss = () => resetIdleTimer();
    editor.on("update", dismiss);
    editor.on("selectionUpdate", dismiss);

    resetIdleTimer();

    return () => {
      editor.off("update", dismiss);
      editor.off("selectionUpdate", dismiss);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [editor, resetIdleTimer]);

  // Dismiss nudge on any keypress
  useEffect(() => {
    const onKey = () => setShowNudge(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleNudgeContinue = useCallback(() => {
    setShowNudge(false);
    if (!editor) return;
    const { from } = editor.state.selection;
    const context = editor.state.doc.textBetween(Math.max(0, from - 300), from);
    if (context.trim().length < 20) return;
    getInlineSuggestion(context)
      .then((suggestion) => {
        editor.commands.setGhostSuggestion(suggestion, from);
      })
      .catch(() => {});
  }, [editor]);

  const handleNudgeSearch = useCallback(() => {
    setShowNudge(false);
    if (!editor) return;
    const { from } = editor.state.selection;
    const context = editor.state.doc.textBetween(Math.max(0, from - 200), from);
    onEditorAction?.({
      scope: "cursor",
      action: "askCopilot",
      text: context,
      from,
      noteId: noteIdRef.current ?? undefined,
      notebookId,
    });
  }, [editor, notebookId, onEditorAction]);

  const handleEditorAction = useCallback((payload: EditorActionRequest) => {
    onEditorAction?.({
      ...payload,
      noteId: noteIdRef.current ?? payload.noteId,
      notebookId,
    });
  }, [notebookId, onEditorAction]);

  const resizeTitleField = useCallback(() => {
    const field = titleFieldRef.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resizeTitleField();
  }, [resizeTitleField, title, isMobileLayout]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Editor body ──────────────────────────────────────── */}
      <div className="hide-scrollbar flex-1 overflow-y-auto" data-testid="note-editor-scroll">
        <div
          className={[
            "mx-auto w-full max-w-[min(100%,var(--editor-content-width,48rem))] tracking-[0.01em]",
            isMobileLayout ? "px-4 pt-10 pb-5 sm:px-6 sm:pt-12 sm:pb-6" : "px-10 pt-20 pb-8",
          ].join(" ")}
          style={{ fontFamily: "var(--editor-font-family, inherit)" }}
          data-testid="note-editor-content-shell"
        >
          <textarea
            ref={titleFieldRef}
            rows={1}
            data-testid="note-title-field"
            className={[
              "w-full resize-none overflow-hidden bg-transparent font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/35 transition-colors focus:placeholder:text-muted-foreground/25",
              isMobileLayout
                ? "mb-5 leading-[1.2]"
                : "mb-6 leading-[1.18]",
            ].join(" ")}
            style={{ fontSize: isMobileLayout ? "2rem" : "var(--editor-title-size, 2.5rem)" }}
            value={title}
            placeholder={t("titlePlaceholder")}
            onChange={(e) => {
              const v = e.target.value
              setTitle(v)
              onActiveNoteTitleChangeRef.current?.(v)
              triggerSave()
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
              }
            }}
          />
          <SelectionActionMenu editor={editor} onEditorAction={handleEditorAction} />
          <div className="relative">
            <BlockHandle editor={editor} onEditorAction={handleEditorAction} />
            <EditorContent editor={editor} />

            {/* AI Nudge bubble */}
            <AnimatePresence>
              {showNudge && (
                <m.div
                  initial={{ opacity: 0, y: 6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                  className="absolute z-30 flex items-center gap-2 rounded-[14px] border border-white/5 bg-[#181816]/90 px-3 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.3)] backdrop-blur-xl"
                  style={{ top: nudgePos.top, left: Math.max(0, nudgePos.left) }}
                >
                  <span className="mr-1 text-[12px] font-medium text-muted-foreground/60">
                    {t("needHelp")}
                  </span>
                  <button
                    type="button"
                    onClick={handleNudgeContinue}
                    className="flex items-center gap-1.5 rounded-[8px] bg-primary/15 px-2.5 py-1 text-[12px] font-medium text-primary transition-all duration-200 hover:bg-primary/25 hover:shadow-[0_0_8px_rgba(var(--primary),0.3)]"
                  >
                    <Pen size={12} />
                    {t("continueWriting")}
                  </button>
                  <button
                    type="button"
                    onClick={handleNudgeSearch}
                    className="flex items-center gap-1.5 rounded-[8px] bg-white/[0.04] px-2.5 py-1 text-[12px] font-medium text-foreground/70 transition-all duration-200 hover:bg-white/[0.08] hover:text-foreground"
                  >
                    <Search size={12} className="text-muted-foreground/70" />
                    {t("searchMaterial")}
                  </button>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
