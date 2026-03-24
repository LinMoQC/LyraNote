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
import { tiptapExtensions } from "@/lib/tiptap";
import { getInlineSuggestion } from "@/services/ai-service";
import { getNoteForNotebook, saveNote } from "@/services/note-service";
import { BlockHandle } from "./block-handle";

type SaveStatus = "idle" | "saving" | "saved" | "error"

const NUDGE_IDLE_MS = 45_000;
const MAX_NUDGES_PER_SESSION = 3;

type NoteEditorProps = {
  notebookId: string;
  notebookTitle?: string;
  onEditorReady?: (editor: Editor) => void;
  onAskAI?: (text: string, action: string) => void;
  onSaveStatusChange?: (status: SaveStatus) => void;
  refreshKey?: number;
  onToggleSources?: () => void;
  sourcesOpen?: boolean;
  wideLayout?: boolean;
};

export function NoteEditor({
  notebookId,
  notebookTitle,
  onEditorReady,
  onAskAI,
  onSaveStatusChange,
  refreshKey = 0,
  wideLayout = false,
}: NoteEditorProps) {
  const t = useTranslations("editor")
  const tNotebook = useTranslations("notebook")
  const [title, setTitle] = useState("")
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const onSaveStatusChangeRef = useRef(onSaveStatusChange);
  onSaveStatusChangeRef.current = onSaveStatusChange;
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
        class: "tiptap outline-none text-[15px] leading-[1.8] text-foreground/85 min-h-[60vh]"
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

  // Load existing note for this notebook (re-runs when refreshKey changes)
  useEffect(() => {
    if (!editor) return
    getNoteForNotebook(notebookId).then((note) => {
      if (!note) return
      noteIdRef.current = note.id
      setTitle(note.title ?? "")
      titleRef.current = note.title ?? ""
      if (note.contentJson) {
        editor.commands.setContent(note.contentJson, true)
      }
    })
  }, [editor, notebookId, refreshKey])

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
    updateSaveStatus("saving")
    saveTimerRef.current = setTimeout(() => void saveNow(), 1500)
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
    onAskAI?.(context, "ask");
  }, [editor, onAskAI]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Editor body ──────────────────────────────────────── */}
      <div className="hide-scrollbar flex-1 overflow-y-auto">
        <div className={`mx-auto px-10 py-8 ${wideLayout ? "max-w-[980px]" : "max-w-[680px]"}`}>
          <input
            className="mb-8 w-full bg-transparent text-[30px] font-bold leading-tight tracking-tight text-foreground outline-none placeholder:text-foreground/15"
            value={title}
            placeholder={t("titlePlaceholder")}
            onChange={(e) => {
              setTitle(e.target.value)
              triggerSave()
            }}
          />
          <SelectionActionMenu editor={editor} onAskAI={onAskAI} />
          <div className="relative">
            <BlockHandle editor={editor} onAskAI={onAskAI} />
            <EditorContent editor={editor} />

            {/* AI Nudge bubble */}
            <AnimatePresence>
              {showNudge && (
                <m.div
                  initial={{ opacity: 0, y: 6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                  className="absolute z-30 flex items-center gap-1.5 rounded-xl border border-border/40 bg-card px-3 py-2 shadow-lg"
                  style={{ top: nudgePos.top, left: Math.max(0, nudgePos.left) }}
                >
                  <span className="mr-1 text-[11px] text-muted-foreground/70">
                    {t("needHelp")}
                  </span>
                  <button
                    type="button"
                    onClick={handleNudgeContinue}
                    className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <Pen size={10} />
                    {t("continueWriting")}
                  </button>
                  <button
                    type="button"
                    onClick={handleNudgeSearch}
                    className="flex items-center gap-1 rounded-lg bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground/80"
                  >
                    <Search size={10} />
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
