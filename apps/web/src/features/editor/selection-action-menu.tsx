"use client";

import { BubbleMenu } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import {
  Bold,
  CheckCircle2,
  Code,
  Italic,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PenLine,
  Sigma,
  Sparkles,
  Strikethrough,
  Underline,
  WandSparkles,
  X,
} from "lucide-react";

import { useInlinePolish } from "@/hooks/use-inline-polish";

type Props = {
  editor: Editor | null;
  onAskAI?: (text: string, action: string) => void;
};

function IconBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-accent/80 text-foreground"
          : "text-foreground/55 hover:bg-accent/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function AiBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[13px] text-foreground/65 transition-colors hover:bg-accent/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <span className="flex-shrink-0 opacity-60">{icon}</span>
      {label}
    </button>
  );
}

export function SelectionActionMenu({ editor, onAskAI }: Props) {
  const { polish, cancel, isPolishing } = useInlinePolish(editor);

  if (!editor) return null;

  const getSelectedText = () =>
    editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      " "
    );

  const handleAI = (action: string) => {
    const text = getSelectedText();
    if (!text.trim()) return;
    onAskAI?.(text, action);
  };

  const handleLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: [160, 110],
        animation: "scale-subtle",
        placement: "bottom-end",
        offset: [160, 20],
        zIndex: 40,
      }}
      shouldShow={({ editor: e, state }) => {
        const { selection } = state;
        if (selection instanceof NodeSelection) return false;
        const nodeType = state.doc.nodeAt(selection.from)?.type;
        if (nodeType?.name === "mindMap") return false;
        if (selection.empty) return false;
        return e.isEditable;
      }}
      className="w-[150px] overflow-hidden rounded-xl border border-border/60 bg-card/95 p-1 shadow-xl shadow-black/30 backdrop-blur-sm"
    >
      {/* ── Row 1: text style + basic inline marks ──────────────── */}
      <div className="flex items-center px-0.5 pt-0.5">
        {/* T — plain text indicator, never shown as "active" to avoid visual noise */}
        <IconBtn
          active={false}
          onClick={() => editor.chain().focus().setParagraph().run()}
          title="Text"
        >
          <span className="text-[15px] font-normal leading-none">T</span>
        </IconBtn>
        <IconBtn
          active={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="Highlight"
        >
          <span className="rounded bg-primary/25 px-[3px] text-[12px] font-bold leading-none text-primary">
            A
          </span>
        </IconBtn>
        <IconBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold size={13} strokeWidth={2.5} />
        </IconBtn>
        <IconBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic size={13} />
        </IconBtn>
        <IconBtn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <Underline size={13} />
        </IconBtn>
      </div>

      {/* ── Row 2: link, strikethrough, code, math, more ──────────── */}
      <div className="flex items-center px-0.5 pb-0.5">
        <IconBtn
          active={editor.isActive("link")}
          onClick={handleLink}
          title="Link"
        >
          <Link2 size={13} />
        </IconBtn>
        <IconBtn
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough size={13} />
        </IconBtn>
        <IconBtn
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
        >
          <Code size={13} />
        </IconBtn>
        <IconBtn active={false} onClick={() => {}} title="Math (coming soon)">
          <Sigma size={13} />
        </IconBtn>
        <IconBtn active={false} onClick={() => {}} title="More">
          <MoreHorizontal size={13} />
        </IconBtn>
      </div>

      {/* ── Divider ─────────────────────────────────────────────── */}
      <div className="my-0.5 h-px bg-border/40" />

      {/* ── AI actions ──────────────────────────────────────────── */}
      <div className="flex flex-col pb-0.5">
        {isPolishing ? (
          <button
            type="button"
            onClick={cancel}
            className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[13px] text-violet-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Loader2 size={13} className="animate-spin flex-shrink-0" />
            Improving…
            <X size={11} className="ml-auto opacity-60" />
          </button>
        ) : (
          <AiBtn
            icon={<WandSparkles size={13} />}
            label="Improve writing"
            onClick={polish}
          />
        )}
        <AiBtn
          icon={<CheckCircle2 size={13} />}
          label="Proofread"
          onClick={() => handleAI("proofread")}
          disabled={isPolishing}
        />
        <AiBtn
          icon={<MessageSquare size={13} />}
          label="Explain"
          onClick={() => handleAI("explain")}
          disabled={isPolishing}
        />
        <AiBtn
          icon={<Sparkles size={13} />}
          label="Reformat"
          onClick={() => handleAI("reformat")}
          disabled={isPolishing}
        />
        <AiBtn
          icon={<PenLine size={13} />}
          label="Edit with AI"
          onClick={() => handleAI("ask")}
          disabled={isPolishing}
        />
      </div>
    </BubbleMenu>
  );
}
