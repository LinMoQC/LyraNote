"use client";

/**
 * @file Tiptap 富文本编辑器
 * @description 基于 Tiptap 的笔记编辑器组件，提供丰富的格式工具栏、
 *              AI Ghost Text 行内补全、选中文本上下文菜单和自动保存功能。
 */

import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo,
  Strikethrough,
  Underline,
  Undo,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatePresence, m } from "framer-motion";
import { Pen, Search } from "lucide-react";

import { SelectionActionMenu } from "@/features/editor/selection-action-menu";
import { tiptapExtensions } from "@/lib/tiptap";
import { getInlineSuggestion } from "@/services/ai-service";
import { getNoteForNotebook, saveNote } from "@/services/note-service";
import { cn } from "@/lib/utils";

type ToolbarButtonProps = {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
};

function ToolbarButton({ active, disabled, label, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground",
        disabled && "pointer-events-none opacity-25"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1.5 h-4 w-px bg-border/40" />;
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

const NUDGE_IDLE_MS = 45_000;
const MAX_NUDGES_PER_SESSION = 3;

type NoteEditorProps = {
  notebookId: string;
  onEditorReady?: (editor: Editor) => void;
  onAskAI?: (text: string, action: string) => void;
  /** Increment to force the editor to reload note content from the server */
  refreshKey?: number;
};

export function NoteEditor({ notebookId, onEditorReady, onAskAI, refreshKey = 0 }: NoteEditorProps) {
  const t = useTranslations("editor")
  const tc = useTranslations("common")
  const [title, setTitle] = useState("")
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
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
        editor.commands.setContent(note.contentJson)
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
      setSaveStatus("saved")
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000)
    } catch {
      setSaveStatus("error")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, notebookId])

  // Debounced auto-save (triggered on every content change)
  const triggerSave = useCallback(() => {
    if (!editor) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setSaveStatus("saving")
    saveTimerRef.current = setTimeout(() => void saveNow(), 1500)
  }, [editor, saveNow])

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
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="relative flex flex-shrink-0 flex-wrap items-center justify-center gap-0.5 bg-card/20 px-4 py-1.5">

        {/* History */}
        <ToolbarButton disabled={!editor?.can().undo()} label="撤销" onClick={() => editor?.chain().focus().undo().run()}>
          <Undo size={14} />
        </ToolbarButton>
        <ToolbarButton disabled={!editor?.can().redo()} label="重做" onClick={() => editor?.chain().focus().redo().run()}>
          <Redo size={14} />
        </ToolbarButton>

        <Divider />

        {/* Headings */}
        <ToolbarButton
          active={editor?.isActive("heading", { level: 1 })}
          label="标题 1"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={14} />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("heading", { level: 2 })}
          label="标题 2"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("heading", { level: 3 })}
          label="标题 3"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={14} />
        </ToolbarButton>

        <Divider />

        {/* Inline formatting */}
        <ToolbarButton active={editor?.isActive("bold")} label="粗体" onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("italic")} label="斜体" onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("underline")} label="下划线" onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <Underline size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("strike")} label="删除线" onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <Strikethrough size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("highlight")} label="高亮" onClick={() => editor?.chain().focus().toggleHighlight().run()}>
          <Highlighter size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("code")} label="行内代码" onClick={() => editor?.chain().focus().toggleCode().run()}>
          <Code size={14} />
        </ToolbarButton>

        <Divider />

        {/* Lists & blocks */}
        <ToolbarButton active={editor?.isActive("bulletList")} label="无序列表" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("orderedList")} label="有序列表" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("blockquote")} label="引用" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive("link")} label="链接" onClick={() => {
          const url = window.prompt(t("linkPlaceholder"));
          if (url) editor?.chain().focus().setLink({ href: url }).run();
          else editor?.chain().focus().unsetLink().run();
        }}>
          <Link2 size={14} />
        </ToolbarButton>

        <Divider />

        {/* Alignment */}
        <ToolbarButton active={editor?.isActive({ textAlign: "left" })} label="左对齐" onClick={() => editor?.chain().focus().setTextAlign("left").run()}>
          <AlignLeft size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive({ textAlign: "center" })} label="居中" onClick={() => editor?.chain().focus().setTextAlign("center").run()}>
          <AlignCenter size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor?.isActive({ textAlign: "right" })} label="右对齐" onClick={() => editor?.chain().focus().setTextAlign("right").run()}>
          <AlignRight size={14} />
        </ToolbarButton>

        {/* Save status — absolute right */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/40" />
              {tc("saving")}
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
              {tc("saved")}
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-[11px] text-red-400/70">{t("saveFailed")}</span>
          )}
        </div>
      </div>

      {/* ── Editor body ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-10 py-12">
          <input
            className="mb-10 w-full bg-transparent text-[30px] font-bold leading-tight tracking-tight text-foreground outline-none placeholder:text-foreground/15"
            value={title}
            placeholder="笔记标题"
            onChange={(e) => {
              setTitle(e.target.value)
              triggerSave()
            }}
          />
          <SelectionActionMenu editor={editor} onAskAI={onAskAI} />
          <div className="relative">
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
                    需要帮忙吗？
                  </span>
                  <button
                    type="button"
                    onClick={handleNudgeContinue}
                    className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <Pen size={10} />
                    继续写
                  </button>
                  <button
                    type="button"
                    onClick={handleNudgeSearch}
                    className="flex items-center gap-1 rounded-lg bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground/80"
                  >
                    <Search size={10} />
                    搜资料
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
