"use client";

import { BubbleMenu } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import {
  Bold,
  Code,
  Eraser,
  Italic,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PencilLine,
  Sigma,
  SmilePlus,
  Sparkles,
  Strikethrough,
  Underline,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import type { EditorActionRequest, InlineRewriteAction } from "@/features/editor/editor-actions";
import { useInlineRewrite } from "@/hooks/use-inline-rewrite";
import { cn } from "@/lib/utils";

type Props = {
  editor: Editor | null;
  onEditorAction?: (payload: EditorActionRequest) => void;
};

const INLINE_ACTIONS: InlineRewriteAction[] = ["polish", "proofread", "reformat", "shorten"];

export function SelectionActionMenu({ editor, onEditorAction }: Props) {
  const t = useTranslations("editor");
  const [customIntent, setCustomIntent] = useState("");
  const [showMore, setShowMore] = useState(false);
  const { isRewriting, preview, runRewrite, applyPreview, retry, cancel } = useInlineRewrite(editor);
  const selectionSnapshotRef = useRef<{ from: number; to: number; text: string } | null>(null);

  function getSelectedRange() {
    if (!editor) return null;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, " ");
    return { from, to, text };
  }

  const liveSelection = getSelectedRange();

  useEffect(() => {
    if (liveSelection?.text.trim()) {
      selectionSnapshotRef.current = liveSelection;
    }
  }, [liveSelection]);

  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const activeEditor = editor;
  const selectionText = liveSelection?.text ?? selectionSnapshotRef.current?.text ?? "";
  const hasSelection = selectionText.trim().length > 0;

  function dispatchExternalAction(action: EditorActionRequest["action"], intent?: string) {
    const selectedRange = getSelectedRange() ?? selectionSnapshotRef.current;
    if (!selectedRange || !hasSelection) return;
    onEditorAction?.({
      scope: "selection",
      action,
      text: selectedRange.text,
      from: selectedRange.from,
      to: selectedRange.to,
      intent,
    });
  }

  function handleSubmitCustomIntent() {
    if (!customIntent.trim()) return;
    dispatchExternalAction("customEdit", customIntent.trim());
    setCustomIntent("");
  }

  function openLinkInput() {
    const prev = activeEditor.getAttributes("link").href as string | undefined;
    setLinkUrl(prev ?? "");
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.select(), 30);
  }

  function commitLink() {
    const url = linkUrl.trim();
    if (url === "") {
      activeEditor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = url.startsWith("http") ? url : `https://${url}`;
      activeEditor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setShowLinkInput(false);
    setLinkUrl("");
  }

  return (
    <BubbleMenu
      editor={activeEditor}
      tippyOptions={{
        duration: [0, 0],
        animation: false,
        placement: "bottom-start",
        offset: [0, 14],
        zIndex: 40,
        interactive: true,
        onMount(instance) {
          const box = instance.popper.firstElementChild as HTMLElement | null;
          if (!box) return;
          box.style.transition = "none";
          box.style.transform = "scale(0.94) translateY(-5px)";
          box.style.opacity = "0";
          requestAnimationFrame(() => {
            box.style.transition =
              "transform 300ms cubic-bezier(0.34,1.56,0.64,1), opacity 180ms ease";
            box.style.transform = "scale(1) translateY(0)";
            box.style.opacity = "1";
          });
        },
        onHide(instance) {
          const box = instance.popper.firstElementChild as HTMLElement | null;
          if (!box) return;
          box.style.transition = "transform 110ms cubic-bezier(0.4,0,1,1), opacity 90ms ease";
          box.style.transform = "scale(0.95) translateY(-4px)";
          box.style.opacity = "0";
        },
      }}
      shouldShow={({ editor: activeEditor, state }) => {
        const { selection } = state;
        if (selection instanceof NodeSelection) return false;
        const nodeType = state.doc.nodeAt(selection.from)?.type;
        if (nodeType?.name === "mindMap") return false;
        if (selection.empty) return false;
        return activeEditor.isEditable;
      }}
      className="overflow-hidden rounded-[12px] border border-white/10 bg-[#252525] p-2 text-foreground shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
    >
      <div
        className="flex w-[192px] flex-col"
        data-testid="selection-action-menu"
      >
        {/* 链接输入面板 */}
        {showLinkInput ? (
          <div className="flex flex-col gap-2 py-0.5">
            {/* 标题行 */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-muted-foreground/50">{t("selectionLink")}</span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  activeEditor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setShowLinkInput(false);
                  setLinkUrl("");
                }}
                className="rounded-[4px] px-1.5 py-0.5 text-[11px] text-red-400/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                {t("selectionLinkRemove")}
              </button>
            </div>

            {/* URL 输入框 */}
            <div className="flex items-center gap-1.5 rounded-[8px] border border-white/10 bg-white/[0.04] px-2.5 py-1.5 transition-colors focus-within:border-white/20 focus-within:bg-white/[0.06]">
              <Link2 size={13} className="shrink-0 text-muted-foreground/40" />
              <input
                ref={linkInputRef}
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitLink(); }
                  if (e.key === "Escape") { e.preventDefault(); setShowLinkInput(false); setLinkUrl(""); }
                }}
                placeholder="https://"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/30"
                data-testid="selection-link-input"
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={commitLink}
                className="flex-1 rounded-[6px] bg-primary/15 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/25"
              >
                {t("selectionLinkConfirm")}
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setShowLinkInput(false); setLinkUrl(""); }}
                className="flex-1 rounded-[6px] border border-white/8 py-1.5 text-[12px] text-foreground/50 transition-colors hover:bg-white/[0.05]"
              >
                {t("selectionLinkCancel")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 第一行：T A B I U */}
            <div className="flex gap-[2px]">
              <FormatButton label={t("blockTypeText")} onClick={() => activeEditor.chain().focus().setParagraph().run()} active={false}>
                <span className="text-[13px] font-semibold leading-none">T</span>
              </FormatButton>
              <FormatButton label={t("selectionHighlight")} onClick={() => activeEditor.chain().focus().toggleHighlight().run()} active={activeEditor.isActive("highlight")}>
                <span className="rounded-[4px] px-[5px] py-[3px] text-[11px] font-semibold leading-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]">A</span>
              </FormatButton>
              <FormatButton label={t("selectionBold")} onClick={() => activeEditor.chain().focus().toggleBold().run()} active={activeEditor.isActive("bold")}>
                <Bold size={15} strokeWidth={2.4} />
              </FormatButton>
              <FormatButton label={t("selectionItalic")} onClick={() => activeEditor.chain().focus().toggleItalic().run()} active={activeEditor.isActive("italic")}>
                <Italic size={15} />
              </FormatButton>
              <FormatButton label={t("selectionUnderline")} onClick={() => activeEditor.chain().focus().toggleUnderline().run()} active={activeEditor.isActive("underline")}>
                <Underline size={15} />
              </FormatButton>
            </div>

            {/* 第二行：链接 删除线 代码 清除标记 更多 */}
            <div className="flex gap-[2px]">
              <FormatButton label={t("selectionLink")} onClick={openLinkInput} active={activeEditor.isActive("link")}>
                <Link2 size={15} />
              </FormatButton>
              <FormatButton label={t("selectionStrike")} onClick={() => activeEditor.chain().focus().toggleStrike().run()} active={activeEditor.isActive("strike")}>
                <Strikethrough size={15} />
              </FormatButton>
              <FormatButton label={t("selectionCode")} onClick={() => activeEditor.chain().focus().toggleCode().run()} active={activeEditor.isActive("code")}>
                <Code size={15} />
              </FormatButton>
              <FormatButton label={t("selectionClearMarks")} onClick={() => activeEditor.chain().focus().unsetAllMarks().run()}>
                <Eraser size={15} />
              </FormatButton>
              <FormatButton label={t("more")} onClick={() => setShowMore((v) => !v)} active={showMore}>
                <MoreHorizontal size={15} />
              </FormatButton>
            </div>

            {/* 分割线 */}
            <div className="my-1 h-px bg-white/[0.08]" />

            {/* AI 技能列表区域 */}
            <div className="relative">
              <div
                className="max-h-[134px] overflow-y-auto"
                style={{ maskImage: "linear-gradient(to bottom, black 75%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, black 75%, transparent 100%)" }}
              >
                {/* 技能标签行 */}
                <div className="flex h-7 items-center justify-between px-2 text-[12px] text-foreground/40">
                  <span>{t("selectionSkillLabel")}</span>
                </div>

                {/* 技能列表 */}
                <div data-testid="selection-ai-skills">
                  {INLINE_ACTIONS.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void runRewrite(action)}
                      disabled={isRewriting || !hasSelection}
                      data-testid={`selection-ai-skill-${action}`}
                      className={cn(
                        "group flex h-7 w-full items-center justify-start gap-1.5 rounded-[6px] px-2 text-left text-[14px] transition-colors duration-75",
                        "text-foreground/90 hover:bg-white/[0.06]",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      <span className="flex-1 truncate">{t(`selectionSkill.${action}`)}</span>
                      <span className="shrink-0 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                        {isRewriting ? <Loader2 size={12} className="animate-spin text-foreground/40" /> : <Sparkles size={12} className="text-foreground/30" />}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => dispatchExternalAction("explain")}
                    disabled={!hasSelection}
                    data-testid="selection-ai-skill-explain"
                    className="group flex h-7 w-full items-center gap-1.5 rounded-[6px] px-2 text-left text-[14px] text-foreground/90 transition-colors duration-75 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex-1 truncate">{t("selectionSkill.explain")}</span>
                  </button>
                </div>
              </div>

              {/* AI 预览覆盖层 */}
              {preview && (
                <div
                  className="absolute inset-0 z-10 flex flex-col rounded-[10px] bg-[#252525] p-3"
                  data-testid="selection-rewrite-preview"
                >
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] text-primary/80">
                    <Sparkles size={13} />
                    <span>{t("selectionPreviewTitle", { action: t(`selectionSkill.${preview.action}`) })}</span>
                  </div>
                  <div className="mb-3 flex-1 overflow-y-auto">
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">{preview.result}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={applyPreview} className="rounded-[6px] bg-primary/20 px-2.5 py-1 text-[12px] font-medium text-primary transition-colors hover:bg-primary/30">
                      {t("selectionApply")}
                    </button>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void retry()} className="rounded-[6px] border border-white/10 px-2.5 py-1 text-[12px] text-foreground/70 transition-colors hover:bg-white/[0.06]">
                      {t("selectionRetry")}
                    </button>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancel} className="rounded-[6px] border border-white/10 px-2.5 py-1 text-[12px] text-foreground/50 transition-colors hover:bg-white/[0.06]">
                      {t("selectionCancel")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 分割线 */}
            <div className="mb-1 h-px bg-white/[0.08]" />

            {/* AI 输入框 — 同 Notion 样式 */}
            <div className="flex min-h-[32px] items-center gap-1.5 rounded-[6px] border border-white/10 px-2 py-1 text-[14px] leading-snug transition-colors focus-within:border-white/20">
              <input
                value={customIntent}
                onChange={(e) => setCustomIntent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (customIntent.trim() && hasSelection) handleSubmitCustomIntent();
                  }
                }}
                placeholder={t("selectionAiInputPlaceholder")}
                className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-foreground/30"
                data-testid="selection-ai-input"
              />
              <span className="shrink-0 text-[11px] text-foreground/30 font-mono">⌘↵</span>
            </div>
          </>
        )}
      </div>
    </BubbleMenu>
  );
}


function FormatButton({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="relative flex-1 group/btn">
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        className={cn(
          "flex h-7 w-full items-center justify-center rounded-[6px] text-foreground/80 transition-colors duration-75",
          active ? "bg-white/[0.14] text-foreground" : "hover:bg-white/[0.08] hover:text-foreground",
          disabled && "cursor-not-allowed opacity-40",
        )}
      >
        {children}
      </button>
      {/* Notion 风格 tooltip */}
      <div className="pointer-events-none absolute left-1/2 bottom-[calc(100%+6px)] z-[999] -translate-x-1/2 opacity-0 transition-opacity duration-150 delay-500 group-hover/btn:opacity-100">
        <div className="whitespace-nowrap rounded-[6px] bg-[#111] px-2 py-1 text-[11px] font-medium text-white/90 shadow-lg">
          {label}
        </div>
        <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[4px] border-x-transparent border-t-[#111]" />
      </div>
    </div>
  );
}


