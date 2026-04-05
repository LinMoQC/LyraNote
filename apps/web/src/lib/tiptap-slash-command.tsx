"use client";

import { Extension, type Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import {
  Code2,
  GitFork,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  AlertCircle,
  Info,
  Lightbulb,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";

// ── Types ────────────────────────────────────────────────────────────────────

type SlashItem = {
  title: string;
  description: string;
  icon: React.ElementType;
  keywords: string[];
  command: (editor: Editor) => void;
};

// ── Commands list ─────────────────────────────────────────────────────────────

const SLASH_ITEMS: SlashItem[] = [
  {
    title: "文本",
    description: "普通段落文字",
    icon: Pilcrow,
    keywords: ["text", "paragraph", "p", "文本", "段落"],
    command: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    title: "标题 1",
    description: "大号标题",
    icon: Heading1,
    keywords: ["h1", "heading", "title", "标题", "#"],
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: "标题 2",
    description: "中号标题",
    icon: Heading2,
    keywords: ["h2", "heading", "标题", "##"],
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: "标题 3",
    description: "小号标题",
    icon: Heading3,
    keywords: ["h3", "heading", "标题", "###"],
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: "引用",
    description: "引用内容块",
    icon: Quote,
    keywords: ["quote", "blockquote", "引用", ">"],
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: "无序列表",
    description: "项目符号列表",
    icon: List,
    keywords: ["bullet", "list", "ul", "无序", "-"],
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: "有序列表",
    description: "编号列表",
    icon: ListOrdered,
    keywords: ["numbered", "ordered", "list", "ol", "有序", "1."],
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "任务列表",
    description: "可勾选的待办清单",
    icon: ListChecks,
    keywords: ["todo", "task", "check", "checkbox", "任务", "[]"],
    command: (editor) => editor.chain().focus().run(), // disabled – no extension
  },
  {
    title: "代码块",
    description: "多行代码区块",
    icon: Code2,
    keywords: ["code", "codeblock", "pre", "代码", "```"],
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "分割线",
    description: "水平分隔线",
    icon: Minus,
    keywords: ["divider", "horizontal", "rule", "分割", "---", "hr"],
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: "思维导图",
    description: "插入思维导图节点",
    icon: GitFork,
    keywords: ["mindmap", "mind", "思维", "导图"],
    command: (editor) => editor.chain().focus().insertContent({ type: "mindMap", attrs: { data: null } }).run(),
  },
  {
    title: "信息提示",
    description: "蓝色信息标注块",
    icon: Info,
    keywords: ["callout", "info", "note", "提示", "信息"],
    command: (editor) => editor.chain().focus().insertContent({ type: "callout", attrs: { type: "info" } }).run(),
  },
  {
    title: "成功提示",
    description: "绿色成功标注块",
    icon: Lightbulb,
    keywords: ["callout", "success", "tip", "成功", "小贴士"],
    command: (editor) => editor.chain().focus().insertContent({ type: "callout", attrs: { type: "success" } }).run(),
  },
  {
    title: "警告提示",
    description: "橙色警告标注块",
    icon: TriangleAlert,
    keywords: ["callout", "warning", "warn", "警告"],
    command: (editor) => editor.chain().focus().insertContent({ type: "callout", attrs: { type: "warning" } }).run(),
  },
  {
    title: "错误提示",
    description: "红色错误标注块",
    icon: AlertCircle,
    keywords: ["callout", "error", "danger", "错误", "危险"],
    command: (editor) => editor.chain().focus().insertContent({ type: "callout", attrs: { type: "error" } }).run(),
  },
];

// ── Dropdown UI ───────────────────────────────────────────────────────────────

type SlashMenuProps = {
  items: SlashItem[];
  command: (item: SlashItem) => void;
  clientRect: (() => DOMRect | null) | null;
};

function SlashMenu({ items, command, clientRect }: SlashMenuProps) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Reset selection when items change
  useEffect(() => { setSelected(0); }, [items]);

  // Track position from clientRect
  useEffect(() => {
    if (!clientRect) return;
    const rect = clientRect();
    if (!rect) return;
    setPos({
      top: rect.bottom + 4 + window.scrollY,
      left: Math.min(rect.left + window.scrollX, window.innerWidth - 280 - 12),
    });
  }, [clientRect, items]);

  // Keyboard navigation
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (s + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (s - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[selected]) command(items[selected]);
    }
  }, [items, selected, command]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey, { capture: true });
    return () => window.removeEventListener("keydown", handleKey, { capture: true });
  }, [handleKey]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-slash-idx="${selected}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation after mount
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return createPortal(
    <AnimatePresence>
      {visible && items.length > 0 && (
        <m.div
          key="slash-menu"
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -5, scale: 0.97, transition: { duration: 0.1, ease: [0.4, 0, 1, 1] } }}
          transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.5 }}
          className="fixed z-[9999] w-[264px] overflow-hidden rounded-[12px] border border-white/10 bg-[#252525] shadow-[0_8px_32px_rgba(0,0,0,0.6)] py-1"
          style={{ top: pos.top, left: pos.left, transformOrigin: "top center" }}
        >
          <div ref={listRef} className="max-h-[280px] overflow-y-auto px-1">
            {items.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  data-slash-idx={i}
                  onClick={() => command(item)}
                  onMouseEnter={() => setSelected(i)}
                  className={`group flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left transition-all duration-75 ${
                    i === selected ? "bg-white/[0.07] text-foreground" : "text-foreground/80 hover:bg-white/[0.05] hover:text-foreground"
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-white/[0.06] border border-white/[0.07]">
                    <Icon size={14} className="text-muted-foreground/80" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium leading-tight">{item.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground/50 leading-tight mt-0.5">{item.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ── ReactRenderer wrapper ─────────────────────────────────────────────────────

class SlashMenuRenderer {
  private renderer: ReactRenderer;

  constructor(props: SlashMenuProps) {
    this.renderer = new ReactRenderer(SlashMenu, {
      props,
      editor: {} as Editor,
    });
  }

  update(props: Partial<SlashMenuProps>) {
    this.renderer.updateProps(props);
  }

  destroy() {
    this.renderer.destroy();
  }
}

// ── Tiptap Extension ──────────────────────────────────────────────────────────

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return { suggestion: {} };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        command: ({ editor, range, props }) => {
          const { item } = props as { item: SlashItem };
          // Delete the slash + query text
          editor.chain().focus().deleteRange(range).run();
          // Run the selected command
          item.command(editor);
        },
        items: ({ query }) => {
          const q = query.toLowerCase();
          if (!q) return SLASH_ITEMS;
          return SLASH_ITEMS.filter((item) =>
            item.title.toLowerCase().includes(q) ||
            item.keywords.some((k) => k.includes(q))
          );
        },
        render: () => {
          let renderer: SlashMenuRenderer | null = null;
          let props: SlashMenuProps | null = null;

          return {
            onStart: (p) => {
              props = {
                items: p.items as SlashItem[],
                command: (item: SlashItem) => {
                  p.command({ item });
                },
                clientRect: p.clientRect ?? null,
              };
              renderer = new SlashMenuRenderer(props);
            },
            onUpdate(p) {
              renderer?.update({
                items: p.items as SlashItem[],
                clientRect: p.clientRect ?? null,
              });
            },
            onKeyDown(p) {
              return p.event.key === "Escape";
            },
            onExit() {
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
