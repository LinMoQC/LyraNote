"use client";

import type { Editor } from "@tiptap/react";
import { AnimatePresence, m } from "framer-motion";
import {
  ChevronRight,
  Code2,
  Copy,
  GitFork,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pen,
  Pilcrow,
  Plus,
  Quote,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type BlockInfo = {
  top: number;
  left: number;
  width: number;
  height: number;
  handleTop: number;
  pos: number;
  node: Node;
  domEl: HTMLElement;
};

type Props = {
  editor: Editor | null;
  onAskAI?: (text: string, action: string) => void;
};

const TOP_LEVEL_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "BLOCKQUOTE", "PRE", "HR",
  "DIV",
]);

function findTopLevelBlock(target: HTMLElement, editorDom: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = target;
  while (el && el !== editorDom) {
    if (el.parentElement === editorDom && TOP_LEVEL_TAGS.has(el.tagName)) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function getBlockRect(el: HTMLElement, editorDom: HTMLElement) {
  const editorRect = editorDom.getBoundingClientRect();
  const blockRect = el.getBoundingClientRect();
  const anchorEl =
    (el.tagName === "UL" || el.tagName === "OL" || el.tagName === "BLOCKQUOTE") &&
    el.firstElementChild instanceof HTMLElement
      ? el.firstElementChild
      : el;
  const anchorRect = anchorEl.getBoundingClientRect();
  const anchorStyle = window.getComputedStyle(anchorEl);
  const parsedLineHeight = Number.parseFloat(anchorStyle.lineHeight);
  const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : anchorRect.height;
  const handleTop = anchorRect.top - editorRect.top + Math.max((Math.min(lineHeight, anchorRect.height) - HANDLE_SIZE) / 2, 0);

  return {
    top: blockRect.top - editorRect.top,
    left: blockRect.left - editorRect.left,
    width: blockRect.width,
    height: blockRect.height,
    handleTop,
  };
}

function getMenuPositionFromBlockRect(rect: DOMRect) {
  return {
    top: rect.top,
    left: rect.left - MENU_WIDTH - MENU_BLOCK_GAP_X,
  };
}

const MENU_WIDTH = 220;
const HANDLE_SIZE = 28;
const HANDLE_LEFT = -72;
const MENU_BLOCK_GAP_X = 44;
const BLOCK_HIGHLIGHT_PAD_X = 10;
const BLOCK_HIGHLIGHT_PAD_Y = 4;
const LIST_MARKER_PAD_X = 18;

function getHighlightInsets(block: BlockInfo) {
  const isListBlock = block.domEl.tagName === "UL" || block.domEl.tagName === "OL";
  return {
    top: BLOCK_HIGHLIGHT_PAD_Y,
    right: BLOCK_HIGHLIGHT_PAD_X,
    bottom: BLOCK_HIGHLIGHT_PAD_Y,
    left: BLOCK_HIGHLIGHT_PAD_X + (isListBlock ? LIST_MARKER_PAD_X : 0),
  };
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let parent = el?.parentElement ?? null;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);
    if (canScrollY && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

export function BlockHandle({ editor, onAskAI }: Props) {
  const [hoverBlock, setHoverBlock] = useState<BlockInfo | null>(null);
  const [anchoredBlock, setAnchoredBlock] = useState<BlockInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addFilter, setAddFilter] = useState("");
  const [menuFilter, setMenuFilter] = useState("");
  const [turnIntoOpen, setTurnIntoOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const turnIntoRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const addFilterRef = useRef<HTMLInputElement>(null);
  const menuFilterRef = useRef<HTMLInputElement>(null);
  const gripBtnRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anyMenuOpen = menuOpen || addMenuOpen;
  const block = anyMenuOpen ? (anchoredBlock ?? hoverBlock) : hoverBlock;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const handleMouseOver = (e: MouseEvent) => {
      if (menuOpen || addMenuOpen) return;
      const target = e.target as HTMLElement;
      const blockEl = findTopLevelBlock(target, dom as HTMLElement);
      if (!blockEl) return;
      clearHideTimer();
      const { top, left, width, height, handleTop } = getBlockRect(blockEl, dom as HTMLElement);
      const pos = editor.view.posAtDOM(blockEl, 0);
      setHoverBlock({ top, left, width, height, handleTop, pos, node: blockEl as unknown as Node, domEl: blockEl });
    };

    const handleMouseLeave = () => {
      if (menuOpen || addMenuOpen) return;
      hideTimerRef.current = setTimeout(() => setHoverBlock(null), 200);
    };

    dom.addEventListener("mouseover", handleMouseOver);
    dom.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      dom.removeEventListener("mouseover", handleMouseOver);
      dom.removeEventListener("mouseleave", handleMouseLeave);
      clearHideTimer();
    };
  }, [editor, menuOpen, addMenuOpen, clearHideTimer]);

  // Close menus on click outside.
  // Use `click` instead of `mousedown` so menu item onClick handlers run first.
  useEffect(() => {
    if (!menuOpen && !addMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (menuOpen) {
        const inMenu = menuRef.current?.contains(target);
        const inSub = turnIntoRef.current?.contains(target);
        if (!inMenu && !inSub) {
          setMenuOpen(false);
          setMenuFilter("");
          setTurnIntoOpen(false);
        }
      }
      if (addMenuOpen && addMenuRef.current && !addMenuRef.current.contains(target)) {
        setAddMenuOpen(false);
        setAddFilter("");
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [menuOpen, addMenuOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (turnIntoOpen) {
          setTurnIntoOpen(false);
          return;
        }
        setMenuOpen(false);
        setAddMenuOpen(false);
        setAddFilter("");
        setMenuFilter("");
        setTurnIntoOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [turnIntoOpen]);

  useEffect(() => {
    if (addMenuOpen) {
      setTimeout(() => addFilterRef.current?.focus(), 60);
    } else {
      setAddFilter("");
    }
  }, [addMenuOpen]);

  useEffect(() => {
    if (menuOpen) {
      setTimeout(() => menuFilterRef.current?.focus(), 60);
    } else {
      setMenuFilter("");
      setTurnIntoOpen(false);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !editor) return;

    const scrollParent = findScrollParent(editor.view.dom as HTMLElement);
    if (!scrollParent) return;

    const prevOverflowY = scrollParent.style.overflowY;
    const prevOverscrollBehavior = scrollParent.style.overscrollBehavior;
    const preventScroll = (e: Event) => e.preventDefault();

    scrollParent.style.overflowY = "hidden";
    scrollParent.style.overscrollBehavior = "contain";
    scrollParent.addEventListener("wheel", preventScroll, { passive: false });
    scrollParent.addEventListener("touchmove", preventScroll, { passive: false });

    return () => {
      scrollParent.style.overflowY = prevOverflowY;
      scrollParent.style.overscrollBehavior = prevOverscrollBehavior;
      scrollParent.removeEventListener("wheel", preventScroll);
      scrollParent.removeEventListener("touchmove", preventScroll);
    };
  }, [menuOpen, editor]);

  useEffect(() => {
    if (!menuOpen && !addMenuOpen) {
      setAnchoredBlock(null);
    }
  }, [menuOpen, addMenuOpen]);

  const anchorCurrentBlock = useCallback((info: BlockInfo | null) => {
    if (info) setAnchoredBlock({ ...info });
  }, []);

  // ── Insert a new block after the current one ──────────────────────────────
  const insertBlock = useCallback(
    (type: string, attrs?: Record<string, unknown>) => {
      if (!editor || !block) return;
      const resolvedPos = editor.state.doc.resolve(block.pos);
      const after = resolvedPos.after(1);
      let content: object;
      switch (type) {
        case "bulletList":
        case "orderedList":
          content = { type, content: [{ type: "listItem", content: [{ type: "paragraph" }] }] };
          break;
        case "blockquote":
          content = { type, content: [{ type: "paragraph" }] };
          break;
        case "horizontalRule":
          content = { type };
          break;
        case "mindMap":
          content = { type, attrs: attrs ?? { data: JSON.stringify({ title: "新思维导图", branches: [] }) } };
          break;
        default:
          content = attrs ? { type, attrs } : { type, content: [] };
      }
      editor.chain().focus().insertContentAt(after, content).run();
      if (type !== "horizontalRule" && type !== "mindMap") {
        editor.commands.setTextSelection(after + 1);
      }
      setAddMenuOpen(false);
      setAddFilter("");
    },
    [editor, block],
  );

  // ── Turn into ─────────────────────────────────────────────────────────────
  const handleTurnInto = useCallback(
    (type: string, attrs?: Record<string, unknown>) => {
      if (!editor || !block) return;
      editor.chain().focus().setTextSelection(block.pos);
      if (type === "paragraph") editor.chain().focus().setParagraph().run();
      else if (type === "heading") editor.chain().focus().toggleHeading(attrs as { level: 1 | 2 | 3 }).run();
      else if (type === "bulletList") editor.chain().focus().toggleBulletList().run();
      else if (type === "orderedList") editor.chain().focus().toggleOrderedList().run();
      else if (type === "blockquote") editor.chain().focus().toggleBlockquote().run();
      setMenuOpen(false);
      setMenuFilter("");
      setTurnIntoOpen(false);
    },
    [editor, block],
  );

  const handleDelete = useCallback(() => {
    if (!editor || !block) return;
    const resolvedPos = editor.state.doc.resolve(block.pos);
    const nodeAfter = resolvedPos.nodeAfter;
    if (nodeAfter) {
      editor.chain().focus().deleteRange({ from: resolvedPos.before(1), to: resolvedPos.before(1) + nodeAfter.nodeSize }).run();
    }
    setMenuOpen(false);
    setMenuFilter("");
    setTurnIntoOpen(false);
    setHoverBlock(null);
    setAnchoredBlock(null);
  }, [editor, block]);

  const handleDuplicate = useCallback(() => {
    if (!editor || !block) return;
    const resolvedPos = editor.state.doc.resolve(block.pos);
    const nodeAfter = resolvedPos.nodeAfter;
    if (nodeAfter) {
      const after = resolvedPos.before(1) + nodeAfter.nodeSize;
      editor.chain().focus().insertContentAt(after, nodeAfter.toJSON()).run();
    }
    setMenuOpen(false);
    setMenuFilter("");
  }, [editor, block]);

  const handleAskAIBlock = useCallback(() => {
    if (!editor || !block) return;
    const resolvedPos = editor.state.doc.resolve(block.pos);
    const nodeAfter = resolvedPos.nodeAfter;
    const text = nodeAfter ? nodeAfter.textContent : "";
    onAskAI?.(text, "ask");
    setMenuOpen(false);
    setMenuFilter("");
  }, [editor, block, onAskAI]);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.href.split("#")[0]}#block-${block?.pos ?? 0}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setMenuOpen(false);
    setMenuFilter("");
  }, [block]);

  const resolveBlockDom = useCallback((info: BlockInfo | null): HTMLElement | null => {
    if (!info || !editor) return null;
    const dom = editor.view.dom as HTMLElement;
    if (info.domEl && dom.contains(info.domEl)) return info.domEl;
    try {
      const domAtPos = editor.view.domAtPos(info.pos);
      let el = domAtPos.node as HTMLElement;
      while (el && el.parentElement !== dom) el = el.parentElement as HTMLElement;
      if (el && el !== dom && dom.contains(el)) return el;
    } catch { /* pos might be invalid */ }
    return null;
  }, [editor]);

  useEffect(() => {
    if (!menuOpen) return;

    const updateMenuPosition = () => {
      const anchoredDom = resolveBlockDom(anchoredBlock ?? hoverBlock);
      const editorDom = editor?.view.dom as HTMLElement | undefined;

      if (anchoredDom && editorDom) {
        const nextRect = getBlockRect(anchoredDom, editorDom);
        setAnchoredBlock((prev) => {
          if (!prev) return prev;
          if (
            prev.top === nextRect.top &&
            prev.left === nextRect.left &&
            prev.width === nextRect.width &&
            prev.height === nextRect.height &&
            prev.handleTop === nextRect.handleTop &&
            prev.domEl === anchoredDom
          ) {
            return prev;
          }
          return { ...prev, ...nextRect, domEl: anchoredDom };
        });
        setMenuPos({
          ...getMenuPositionFromBlockRect(anchoredDom.getBoundingClientRect()),
        });
      }
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    document.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      document.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuOpen, anchoredBlock, hoverBlock, resolveBlockDom, editor]);

  if (!editor || !editor.isEditable) return null;

  // ── Turn-into items ─────────────────────────────────────────────────────
  const turnIntoItems = [
    { label: "Text", icon: Pilcrow, action: () => handleTurnInto("paragraph") },
    { label: "H1", icon: Heading1, action: () => handleTurnInto("heading", { level: 1 }) },
    { label: "H2", icon: Heading2, action: () => handleTurnInto("heading", { level: 2 }) },
    { label: "H3", icon: Heading3, action: () => handleTurnInto("heading", { level: 3 }) },
    { label: "Bullet List", icon: List, action: () => handleTurnInto("bulletList") },
    { label: "Numbered List", icon: ListOrdered, action: () => handleTurnInto("orderedList") },
    { label: "Quote", icon: Quote, action: () => handleTurnInto("blockquote") },
  ];

  // ── Main menu items (filterable) ──────────────────────────────────────────
  type MenuItem =
    | { type: "action"; label: string; icon: typeof Pilcrow; action: () => void; shortcut?: string; danger?: boolean; ai?: boolean }
    | { type: "sub"; label: string; icon: typeof Pilcrow; onHover: () => void }
    | { type: "divider" }
    | { type: "section"; label: string };

  const allMenuItems: MenuItem[] = [
    { type: "section", label: "Text" },
    { type: "sub", label: "Turn into", icon: Pilcrow, onHover: () => setTurnIntoOpen(true) },
    { type: "divider" },
    { type: "action", label: "Copy link to block", icon: Link2, action: handleCopyLink, shortcut: "⌘⌥L" },
    { type: "action", label: "Duplicate", icon: Copy, action: handleDuplicate, shortcut: "⌘D" },
    { type: "action", label: "Delete", icon: Trash2, action: handleDelete, danger: true, shortcut: "Del" },
    { type: "divider" },
    { type: "action", label: "Ask AI", icon: Sparkles, action: handleAskAIBlock, ai: true, shortcut: "⌘J" },
  ];

  const mf = menuFilter.toLowerCase();
  const filteredMenuItems = mf
    ? allMenuItems.filter((item) => {
        if (item.type === "divider" || item.type === "section") return false;
        return item.label.toLowerCase().includes(mf);
      })
    : allMenuItems;

  // ── Add-block data ─────────────────────────────────────────────────────────
  const basicBlocks = [
    { label: "Text", hint: "", icon: Pilcrow, action: () => insertBlock("paragraph") },
    { label: "Heading 1", hint: "#", icon: Heading1, action: () => insertBlock("heading", { level: 1 }) },
    { label: "Heading 2", hint: "##", icon: Heading2, action: () => insertBlock("heading", { level: 2 }) },
    { label: "Heading 3", hint: "###", icon: Heading3, action: () => insertBlock("heading", { level: 3 }) },
    { label: "Bullet List", hint: "-", icon: List, action: () => insertBlock("bulletList") },
    { label: "Numbered List", hint: "1.", icon: ListOrdered, action: () => insertBlock("orderedList") },
    { label: "Quote", hint: '"', icon: Quote, action: () => insertBlock("blockquote") },
    { label: "Code Block", hint: "```", icon: Code2, action: () => insertBlock("codeBlock") },
    { label: "Divider", hint: "---", icon: Minus, action: () => insertBlock("horizontalRule") },
  ];
  const lyranoteBlocks = [
    { label: "Mind Map", hint: "", icon: GitFork, action: () => insertBlock("mindMap") },
    { label: "AI Continue Writing", hint: "", icon: Pen, action: () => { onAskAI?.("", "continue"); setAddMenuOpen(false); } },
    { label: "AI Summarize Sources", hint: "", icon: Sparkles, action: () => { onAskAI?.("", "summarize"); setAddMenuOpen(false); } },
  ];

  const lc = addFilter.toLowerCase();
  const filteredBasic = basicBlocks.filter((i) => i.label.toLowerCase().includes(lc));
  const filteredLyranote = lyranoteBlocks.filter((i) => i.label.toLowerCase().includes(lc));
  const hasResults = filteredBasic.length > 0 || filteredLyranote.length > 0;

  return (
    <div
      ref={containerRef}
      onMouseEnter={clearHideTimer}
      onMouseLeave={() => {
        if (!menuOpen && !addMenuOpen) {
          hideTimerRef.current = setTimeout(() => setHoverBlock(null), 200);
        }
      }}
    >
      <AnimatePresence>
        {anyMenuOpen && block && (
          <m.div
            key={`overlay-anchored-${block.pos}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-10 rounded-md"
            {...(() => {
              const insets = getHighlightInsets(block);
              return {
                style: {
                  top: block.top - insets.top,
                  left: block.left - insets.left,
                  width: block.width + insets.left + insets.right,
                  height: block.height + insets.top + insets.bottom,
                  backgroundColor: "rgba(124, 90, 240, 0.14)",
                  outline: "2px solid rgba(124, 90, 240, 0.30)",
                  outlineOffset: "0px",
                },
              };
            })()}
          />
        )}
      </AnimatePresence>

      {/* ── Handle buttons ─────────────────────────────────────────── */}
      <AnimatePresence>
        {block && (
          <m.div
            key={anyMenuOpen ? "anchored" : "hover"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute z-20 flex items-center gap-0.5"
            style={{ top: block.handleTop, left: HANDLE_LEFT }}
          >
            <button
              type="button"
              onClick={() => {
                if (!editor || !block) return;
                const resolvedPos = editor.state.doc.resolve(block.pos);
                const after = resolvedPos.after(1);
                editor.chain().focus().insertContentAt(after, { type: "paragraph", content: [] }).run();
                editor.commands.setTextSelection(after + 1);
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-foreground/60"
              title="Insert paragraph below"
            >
              <Plus size={16} />
            </button>
            <button
              ref={gripBtnRef}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (!menuOpen) {
                  const currentBlock = block ?? hoverBlock;
                  anchorCurrentBlock(currentBlock);
                  const currentDom = resolveBlockDom(currentBlock);
                  if (currentDom) {
                    setMenuPos({
                      ...getMenuPositionFromBlockRect(currentDom.getBoundingClientRect()),
                    });
                  }
                  setMenuOpen(true);
                } else {
                  setMenuOpen(false);
                }
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-foreground/60"
              title="Block menu"
            >
              <GripVertical size={16} />
            </button>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── + Add block menu (below handle) ────────────────────────── */}
      <AnimatePresence>
        {addMenuOpen && block && (
          <m.div
            ref={addMenuRef}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute -left-16 z-30 w-56 overflow-hidden rounded-lg border border-border/60 bg-card shadow-xl shadow-black/20"
            style={{ top: block.top + block.height + 4 }}
          >
            <div className="border-b border-border/30 px-3 py-2">
              <input
                ref={addFilterRef}
                value={addFilter}
                onChange={(e) => setAddFilter(e.target.value)}
                placeholder="Type to filter..."
                className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/35"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredBasic.length > 0 && (
                <>
                  {!addFilter && (
                    <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground/40">Basic blocks</p>
                  )}
                  {filteredBasic.map((item) => (
                    <button key={item.label} type="button" onClick={item.action} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground">
                      <item.icon size={14} className="flex-shrink-0 opacity-60" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.hint && <span className="text-[11px] text-muted-foreground/30">{item.hint}</span>}
                    </button>
                  ))}
                </>
              )}
              {filteredLyranote.length > 0 && (
                <>
                  {!addFilter && (
                    <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground/40">LyraNote</p>
                  )}
                  {filteredLyranote.map((item) => (
                    <button key={item.label} type="button" onClick={item.action} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-primary/8 hover:text-primary">
                      <item.icon size={14} className="flex-shrink-0 text-primary/60" />
                      <span className="flex-1 text-left text-foreground/70 hover:text-primary">{item.label}</span>
                    </button>
                  ))}
                </>
              )}
              {!hasResults && (
                <p className="py-3 text-center text-[12px] text-muted-foreground/40">No results</p>
              )}
            </div>
            <div className="border-t border-border/30">
              <button type="button" onClick={() => { setAddMenuOpen(false); setAddFilter(""); }} className="flex w-full items-center justify-between px-3 py-1.5 text-[12px] text-muted-foreground/50 transition-colors hover:bg-muted/40 hover:text-foreground/70">
                <span>Close menu</span>
                <span className="text-[11px] text-muted-foreground/30">esc</span>
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── ⋮⋮ Block action menu — portalled to body, fixed position ── */}
      {createPortal(
        <AnimatePresence>
          {menuOpen && menuPos && (
            <m.div
              ref={menuRef}
              initial={{ opacity: 0, x: 8, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 8, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="fixed isolate z-[2147483646] rounded-lg border border-border/70 bg-card/98 shadow-2xl shadow-black/35 backdrop-blur-xl"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: MENU_WIDTH,
              }}
            >
              {/* Search input */}
              <div className="border-b border-border/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Search size={13} className="flex-shrink-0 text-muted-foreground/40" />
                  <input
                    ref={menuFilterRef}
                    value={menuFilter}
                    onChange={(e) => { setMenuFilter(e.target.value); setTurnIntoOpen(false); }}
                    placeholder="Search actions..."
                    className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/35"
                  />
                </div>
              </div>

              {/* Menu items */}
              <div className="max-h-80 overflow-y-auto p-1">
                {filteredMenuItems.map((item, i) => {
                  if (item.type === "divider") {
                    return <div key={`d-${i}`} className="my-1 h-px bg-border/40" />;
                  }
                  if (item.type === "section") {
                    return (
                      <p key={`s-${i}`} className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                        {item.label}
                      </p>
                    );
                  }
                  if (item.type === "sub") {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onMouseEnter={item.onHover}
                        onClick={() => setTurnIntoOpen((v) => !v)}
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
                      >
                        <item.icon size={14} className="flex-shrink-0 opacity-60" />
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronRight size={13} className="flex-shrink-0 text-muted-foreground/40" />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.action}
                      onMouseEnter={() => setTurnIntoOpen(false)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                        item.danger
                          ? "text-red-400 hover:bg-red-500/10"
                          : item.ai
                            ? "text-primary/70 hover:bg-primary/8 hover:text-primary"
                            : "text-foreground/70 hover:bg-muted/60 hover:text-foreground"
                      }`}
                    >
                      <item.icon size={14} className="flex-shrink-0 opacity-60" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.shortcut && (
                        <span className="text-[11px] text-muted-foreground/30">{item.shortcut}</span>
                      )}
                    </button>
                  );
                })}
                {mf && filteredMenuItems.length === 0 && (
                  <p className="py-3 text-center text-[12px] text-muted-foreground/40">No results</p>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* ── Turn-into sub-menu — portalled to body ─────────────────── */}
      {createPortal(
        <AnimatePresence>
          {menuOpen && turnIntoOpen && menuPos && (
            <m.div
              ref={turnIntoRef}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.1 }}
              onMouseLeave={() => setTurnIntoOpen(false)}
              className="fixed isolate z-[2147483647] w-44 overflow-hidden rounded-lg border border-border/70 bg-card/98 p-1 shadow-2xl shadow-black/35 backdrop-blur-xl"
              style={{
                top: menuPos.top,
                left: menuPos.left + MENU_WIDTH + 4,
              }}
            >
              <p className="px-2.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                Turn into
              </p>
              {turnIntoItems.map((ti) => (
                <button
                  key={ti.label}
                  type="button"
                  onClick={ti.action}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <ti.icon size={14} className="flex-shrink-0 opacity-60" />
                  {ti.label}
                </button>
              ))}
            </m.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
