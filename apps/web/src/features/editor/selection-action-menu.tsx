"use client";

import { BubbleMenu } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { Loader2, MessageSquare, Quote, Sparkles, X } from "lucide-react";

import { useInlinePolish } from "@/hooks/use-inline-polish";
import { useTranslations } from "next-intl";

type Props = {
  editor: Editor | null;
  onAskAI?: (text: string, action: string) => void;
};

export function SelectionActionMenu({ editor, onAskAI }: Props) {
  const t = useTranslations("editor");
  const { polish, cancel, isPolishing } = useInlinePolish(editor);

  if (!editor) return null;

  const handleAsk = () => {
    const text = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      " "
    );
    if (!text.trim()) return;
    onAskAI?.(text, "ask");
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 120, placement: "top-start", zIndex: 40 }}
      // Hide when a mind-map node is selected (atom node with no real text)
      shouldShow={({ editor: e, state }) => {
        const { selection } = state;
        // If the selected node type is our mindMap node, don't show
        const nodeType = state.doc.nodeAt(selection.from)?.type
        if (nodeType?.name === "mindMap") return false
        // Also hide on empty selection
        if (selection.empty) return false
        return e.isEditable
      }}
      className="flex items-center gap-0.5 overflow-hidden rounded-lg border border-border/60 bg-card p-0.5 shadow-lg shadow-black/20"
    >
      {/* Formatting */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`rounded-md px-2 py-1 text-xs font-bold transition-colors ${editor.isActive("bold") ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`rounded-md px-2 py-1 text-xs italic transition-colors ${editor.isActive("italic") ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`rounded-md px-2 py-1 text-xs line-through transition-colors ${editor.isActive("strike") ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
      >
        S
      </button>

      <div className="mx-0.5 h-3.5 w-px bg-border/60" />

      {/* Ask AI */}
      <button
        type="button"
        onClick={handleAsk}
        disabled={isPolishing}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
      >
        <MessageSquare size={11} />
        Ask AI
      </button>

      {/* Inline polish — streams AI rewrite directly into editor */}
      {isPolishing ? (
        <button
          type="button"
          onClick={cancel}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-violet-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
          title="停止优化"
        >
          <Loader2 size={11} className="animate-spin" />
          <span className="tabular-nums">{t("optimizing")}</span>
          <X size={10} className="opacity-60" />
        </button>
      ) : (
        <button
          type="button"
          onClick={polish}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          title="AI 直接在文中优化选中内容"
        >
          <Sparkles size={11} />
          优化
        </button>
      )}

      <div className="mx-0.5 h-3.5 w-px bg-border/60" />

      {/* Blockquote */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        disabled={isPolishing}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Quote size={11} />
        引用
      </button>
    </BubbleMenu>
  );
}
