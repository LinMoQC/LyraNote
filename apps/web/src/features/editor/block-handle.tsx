"use client";

import type { Editor } from "@tiptap/react";
import { AnimatePresence, m } from "framer-motion";
import type { TargetAndTransition, Transition } from "framer-motion";
import {
  ArrowRightLeft,
  Check,
  ChevronRight,
  Code2,
  Copy,
  GitFork,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MessageSquare,
  Minus,
  MoveRight,
  Palette,
  Pen,
  Pilcrow,
  Plus,
  Quote,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import type { EditorActionRequest } from "@/features/editor/editor-actions";
import { cn } from "@/lib/utils";

type BlockInfo = {
  top: number;
  left: number;
  width: number;
  height: number;
  handleTop: number;
  pos: number;
  domEl: HTMLElement;
};

type MenuMode = "actions" | "insert" | null;
type SubmenuMode = "turnInto" | "colors" | null;

type Props = {
  editor: Editor | null;
  onEditorAction?: (payload: EditorActionRequest) => void;
};

type BaseMenuItem = {
  label: string;
  icon: typeof Pilcrow;
  shortcut?: string;
  disabled?: boolean;
};

type SubmenuItem = BaseMenuItem & {
  type: "submenu";
  submenu: Exclude<SubmenuMode, null>;
};

type ActionItem = BaseMenuItem & {
  type: "action";
  onSelect: () => void;
  tone?: "default" | "danger" | "ai";
};

type BlockMenuItem = SubmenuItem | ActionItem;

const TOP_LEVEL_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "BLOCKQUOTE", "PRE", "HR",
  "DIV",
]);

const ACTION_MENU_WIDTH = 260;
const SUBMENU_WIDTH = 240;
const INSERT_MENU_WIDTH = 280;
const HANDLE_SIZE = 30;
const HANDLE_LEFT = -76;
const MENU_GAP_X = 28;
const ACTION_MENU_HEIGHT_EST = 400;
const SUBMENU_HEIGHT_EST = 380;
const INSERT_MENU_HEIGHT_EST = 320;
const MENU_GAP_Y = 12;
const BLOCK_HIGHLIGHT_PAD_X = 12;
const BLOCK_HIGHLIGHT_PAD_Y = 4;
const LIST_MARKER_PAD_X = 18;

const TEXT_COLORS = [
  { key: "default-text", labelKey: "blockColorDefaultText", swatch: "bg-transparent ring-1 ring-white/10", selected: true },
  { key: "gray-text", labelKey: "blockColorGrayText", swatch: "bg-zinc-500/70" },
  { key: "amber-text", labelKey: "blockColorAmberText", swatch: "bg-amber-500/80" },
  { key: "green-text", labelKey: "blockColorGreenText", swatch: "bg-emerald-500/80" },
  { key: "blue-text", labelKey: "blockColorBlueText", swatch: "bg-sky-500/80" },
  { key: "purple-text", labelKey: "blockColorPurpleText", swatch: "bg-violet-500/80" },
];

const BACKGROUND_COLORS = [
  { key: "default-bg", labelKey: "blockColorDefaultBackground", swatch: "bg-transparent ring-1 ring-white/10", selected: true },
  { key: "gray-bg", labelKey: "blockColorGrayBackground", swatch: "bg-zinc-600/60" },
  { key: "amber-bg", labelKey: "blockColorAmberBackground", swatch: "bg-amber-600/50" },
  { key: "green-bg", labelKey: "blockColorGreenBackground", swatch: "bg-emerald-600/50" },
  { key: "blue-bg", labelKey: "blockColorBlueBackground", swatch: "bg-sky-600/50" },
  { key: "purple-bg", labelKey: "blockColorPurpleBackground", swatch: "bg-violet-600/50" },
];

function findTopLevelBlock(target: HTMLElement, editorDom: HTMLElement): HTMLElement | null {
  let element: HTMLElement | null = target;
  while (element && element !== editorDom) {
    if (element.parentElement === editorDom && TOP_LEVEL_TAGS.has(element.tagName)) {
      return element;
    }
    element = element.parentElement;
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

function clampLeft(left: number, width: number) {
  if (typeof window === "undefined") return left;
  return Math.max(12, Math.min(left, window.innerWidth - width - 12));
}

function clampTop(top: number, height: number) {
  if (typeof window === "undefined") return top;
  return Math.max(12, Math.min(top, window.innerHeight - height - 12));
}

function getMenuPositionFromBlockRect(rect: DOMRect, width: number, height: number = ACTION_MENU_HEIGHT_EST) {
  return {
    top: clampTop(rect.top - 10, height),
    left: clampLeft(rect.left - width - MENU_GAP_X, width),
  };
}

function getInsertMenuPositionBelowBlock(rect: DOMRect) {
  // Position below the block, left-aligned with the block content
  let top = rect.bottom + 4;
  const left = clampLeft(rect.left, INSERT_MENU_WIDTH);

  if (typeof window !== "undefined" && top + INSERT_MENU_HEIGHT_EST > window.innerHeight - MENU_GAP_Y) {
    // If not enough space below, try above the block
    const spaceAbove = rect.top - 12;
    if (spaceAbove > INSERT_MENU_HEIGHT_EST) {
      top = rect.top - INSERT_MENU_HEIGHT_EST - 4;
    } else {
      // If still not enough, just clamp to the bottom
      top = Math.max(12, window.innerHeight - INSERT_MENU_HEIGHT_EST - MENU_GAP_Y);
    }
  }

  return { top, left };
}

function getHighlightInsets(block: BlockInfo) {
  const isListBlock = block.domEl?.tagName === "UL" || block.domEl?.tagName === "OL";
  return {
    top: BLOCK_HIGHLIGHT_PAD_Y,
    right: BLOCK_HIGHLIGHT_PAD_X,
    bottom: BLOCK_HIGHLIGHT_PAD_Y,
    left: BLOCK_HIGHLIGHT_PAD_X + (isListBlock ? LIST_MARKER_PAD_X : 0),
  };
}

export function BlockHandle({ editor, onEditorAction }: Props) {
  const t = useTranslations("editor");
  const [hoverBlock, setHoverBlock] = useState<BlockInfo | null>(null);
  const [anchoredBlock, setAnchoredBlock] = useState<BlockInfo | null>(null);
  const [menuMode, setMenuMode] = useState<MenuMode>(null);
  const [submenuMode, setSubmenuMode] = useState<SubmenuMode>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [search, setSearch] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anyMenuOpen = menuMode !== null;
  const block = anyMenuOpen ? (anchoredBlock ?? hoverBlock) : hoverBlock;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const closeMenus = useCallback(() => {
    setMenuMode(null);
    setSubmenuMode(null);
    setSearch("");
    setAnchoredBlock(null);
  }, []);

  const resolveBlockDom = useCallback((info: BlockInfo | null): HTMLElement | null => {
    if (!info || !editor) return null;
    const dom = editor.view.dom as HTMLElement;
    if (info.domEl && dom.contains(info.domEl)) return info.domEl;
    try {
      const domAtPos = editor.view.domAtPos(info.pos);
      let el = domAtPos.node as HTMLElement;
      while (el && el.parentElement !== dom) {
        el = el.parentElement as HTMLElement;
      }
      if (el && el !== dom && dom.contains(el)) return el;
    } catch {
      return null;
    }
    return null;
  }, [editor]);

  const anchorBlock = useCallback((nextBlock: BlockInfo | null, nextMode: Exclude<MenuMode, null>) => {
    if (!nextBlock) return;
    setAnchoredBlock({ ...nextBlock });
    const currentDom = resolveBlockDom(nextBlock);
    if (currentDom) {
      if (nextMode === "insert") {
        setMenuPos(getInsertMenuPositionBelowBlock(currentDom.getBoundingClientRect()));
      } else {
        setMenuPos(getMenuPositionFromBlockRect(currentDom.getBoundingClientRect(), ACTION_MENU_WIDTH));
      }
    }
    setMenuMode(nextMode);
    setSubmenuMode(null);
    setSearch("");
  }, [resolveBlockDom]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;

    const handleMouseOver = (event: MouseEvent) => {
      if (anyMenuOpen) return;
      const target = event.target as HTMLElement;
      const blockEl = findTopLevelBlock(target, dom);
      if (!blockEl) return;
      clearHideTimer();
      const { top, left, width, height, handleTop } = getBlockRect(blockEl, dom);
      const pos = editor.view.posAtDOM(blockEl, 0);
      setHoverBlock({ top, left, width, height, handleTop, pos, domEl: blockEl });
    };

    const handleMouseLeave = () => {
      if (anyMenuOpen) return;
      hideTimerRef.current = setTimeout(() => setHoverBlock(null), 180);
    };

    dom.addEventListener("mouseover", handleMouseOver);
    dom.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      dom.removeEventListener("mouseover", handleMouseOver);
      dom.removeEventListener("mouseleave", handleMouseLeave);
      clearHideTimer();
    };
  }, [anyMenuOpen, clearHideTimer, editor]);

  useEffect(() => {
    if (!anyMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const inMenu = menuRef.current?.contains(target);
      const inSubmenu = submenuRef.current?.contains(target);
      if (!inMenu && !inSubmenu) {
        closeMenus();
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [anyMenuOpen, closeMenus]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (submenuMode) {
        setSubmenuMode(null);
        return;
      }
      closeMenus();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [closeMenus, submenuMode]);

  useEffect(() => {
    if (!anyMenuOpen || !editor) return;

    const updateMenuPosition = () => {
      const anchoredDom = resolveBlockDom(anchoredBlock ?? hoverBlock);
      const editorDom = editor.view.dom as HTMLElement;
      if (!anchoredDom || !editorDom) return;
      const nextRect = getBlockRect(anchoredDom, editorDom);
      setAnchoredBlock((prev) => {
        if (!prev) return prev;
        if (
          prev.top === nextRect.top &&
          prev.left === nextRect.left &&
          prev.width === nextRect.width &&
          prev.height === nextRect.height &&
          prev.domEl === anchoredDom
        ) {
          return prev;
        }
        return { ...prev, ...nextRect, domEl: anchoredDom };
      });
      if (menuMode === "insert") {
        setMenuPos(getInsertMenuPositionBelowBlock(anchoredDom.getBoundingClientRect()));
      } else {
        setMenuPos(getMenuPositionFromBlockRect(anchoredDom.getBoundingClientRect(), ACTION_MENU_WIDTH));
      }
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    document.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      document.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [anchoredBlock, anyMenuOpen, editor, hoverBlock, menuMode, resolveBlockDom]);

  useEffect(() => {
    if (menuMode !== "actions" || !editor) return;
    const scrollParent = findScrollParent(editor.view.dom as HTMLElement);
    if (!scrollParent) return;

    const previousOverflowY = scrollParent.style.overflowY;
    const previousOverscrollBehavior = scrollParent.style.overscrollBehavior;
    const preventScroll = (event: Event) => event.preventDefault();

    scrollParent.style.overflowY = "hidden";
    scrollParent.style.overscrollBehavior = "contain";
    scrollParent.addEventListener("wheel", preventScroll, { passive: false });
    scrollParent.addEventListener("touchmove", preventScroll, { passive: false });

    return () => {
      scrollParent.style.overflowY = previousOverflowY;
      scrollParent.style.overscrollBehavior = previousOverscrollBehavior;
      scrollParent.removeEventListener("wheel", preventScroll);
      scrollParent.removeEventListener("touchmove", preventScroll);
    };
  }, [editor, menuMode]);

  const dispatchBlockAction = useCallback((action: EditorActionRequest["action"], text: string = "") => {
    if (!block) return;
    onEditorAction?.({
      scope: "block",
      action,
      text,
      blockPos: block.pos,
    });
    closeMenus();
  }, [block, closeMenus, onEditorAction]);

  const insertBlock = useCallback((type: string, attrs?: Record<string, unknown>) => {
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
      case "codeBlock":
        content = { type, content: [{ type: "paragraph" }] };
        break;
      case "horizontalRule":
        content = { type };
        break;
      case "mindMap":
        content = { type, attrs: attrs ?? { data: JSON.stringify({ title: t("mindMapDefaultTitle"), branches: [] }) } };
        break;
      default:
        content = attrs ? { type, attrs, content: [] } : { type, content: [] };
    }

    editor.chain().focus().insertContentAt(after, content).run();
    if (type !== "horizontalRule" && type !== "mindMap") {
      editor.commands.setTextSelection(after + 1);
    }
    closeMenus();
  }, [block, closeMenus, editor, t]);

  const transformBlock = useCallback((type: string, attrs?: Record<string, unknown>) => {
    if (!editor || !block) return;
    editor.chain().focus().setTextSelection(block.pos).run();
    if (type === "paragraph") editor.chain().focus().setParagraph().run();
    else if (type === "heading") editor.chain().focus().toggleHeading(attrs as { level: 1 | 2 | 3 }).run();
    else if (type === "bulletList") editor.chain().focus().toggleBulletList().run();
    else if (type === "orderedList") editor.chain().focus().toggleOrderedList().run();
    else if (type === "blockquote") editor.chain().focus().toggleBlockquote().run();
    else if (type === "codeBlock") editor.chain().focus().toggleCodeBlock().run();
    closeMenus();
  }, [block, closeMenus, editor]);

  const duplicateBlock = useCallback(() => {
    if (!editor || !block) return;
    const resolvedPos = editor.state.doc.resolve(block.pos);
    const nodeAfter = resolvedPos.nodeAfter;
    if (!nodeAfter) return;
    const after = resolvedPos.before(1) + nodeAfter.nodeSize;
    editor.chain().focus().insertContentAt(after, nodeAfter.toJSON()).run();
    closeMenus();
  }, [block, closeMenus, editor]);

  const deleteBlock = useCallback(() => {
    if (!editor || !block) return;
    const resolvedPos = editor.state.doc.resolve(block.pos);
    const nodeAfter = resolvedPos.nodeAfter;
    if (!nodeAfter) return;
    editor.chain().focus().deleteRange({
      from: resolvedPos.before(1),
      to: resolvedPos.before(1) + nodeAfter.nodeSize,
    }).run();
    setHoverBlock(null);
    closeMenus();
  }, [block, closeMenus, editor]);

  const copyBlockLink = useCallback(() => {
    const url = `${window.location.href.split("#")[0]}#block-${block?.pos ?? 0}`;
    navigator.clipboard.writeText(url).catch(() => {});
    closeMenus();
  }, [block?.pos, closeMenus]);

  const blockText = useMemo(() => {
    if (!editor || !block) return "";
    const resolvedPos = editor.state.doc.resolve(block.pos);
    return resolvedPos.nodeAfter?.textContent ?? "";
  }, [block, editor]);

  const transformItems = [
    { label: t("blockTypeText"), icon: Pilcrow, onSelect: () => transformBlock("paragraph") },
    { label: t("blockTypeHeading1"), icon: Heading1, onSelect: () => transformBlock("heading", { level: 1 }) },
    { label: t("blockTypeHeading2"), icon: Heading2, onSelect: () => transformBlock("heading", { level: 2 }) },
    { label: t("blockTypeHeading3"), icon: Heading3, onSelect: () => transformBlock("heading", { level: 3 }) },
    { label: t("blockTypeBulletList"), icon: List, onSelect: () => transformBlock("bulletList") },
    { label: t("blockTypeNumberedList"), icon: ListOrdered, onSelect: () => transformBlock("orderedList") },
    { label: t("blockTypeQuote"), icon: Quote, onSelect: () => transformBlock("blockquote") },
    { label: t("blockTypeCode"), icon: Code2, onSelect: () => transformBlock("codeBlock") },
  ];

  const actionGroups = useMemo(() => {
    const groups: Array<{ key: string; items: BlockMenuItem[] }> = [
      {
        key: "structure",
        items: [
          { type: "submenu", label: t("blockTurnInto"), icon: ArrowRightLeft, submenu: "turnInto" },
          { type: "submenu", label: t("blockColor"), icon: Palette, submenu: "colors" },
        ],
      },
      {
        key: "actions",
        items: [
          { type: "action", label: t("blockCopyLink"), icon: Link2, shortcut: "⌘⌃L", onSelect: copyBlockLink },
          { type: "action", label: t("blockDuplicate"), icon: Copy, shortcut: "⌘D", onSelect: duplicateBlock },
          { type: "action", label: t("blockDelete"), icon: Trash2, shortcut: "Del", onSelect: deleteBlock, tone: "danger" },
        ],
      },
      {
        key: "ai",
        items: [
          { type: "action", label: t("blockAskAI"), icon: WandSparkles, shortcut: "⌘J", onSelect: () => dispatchBlockAction("askCopilot", blockText), tone: "ai" },
        ],
      },
    ];
    return groups;
  }, [blockText, copyBlockLink, deleteBlock, dispatchBlockAction, duplicateBlock, t]);

  const insertGroups = useMemo(() => {
    return [
      {
        key: "basic",
        title: t("blockSectionBasic"),
        items: [
          { label: t("blockTypeText"), icon: Pilcrow, onSelect: () => insertBlock("paragraph") },
          { label: t("blockTypeHeading1"), icon: Heading1, shortcut: "#", onSelect: () => insertBlock("heading", { level: 1 }) },
          { label: t("blockTypeHeading2"), icon: Heading2, shortcut: "##", onSelect: () => insertBlock("heading", { level: 2 }) },
          { label: t("blockTypeHeading3"), icon: Heading3, shortcut: "###", onSelect: () => insertBlock("heading", { level: 3 }) },
          { label: t("blockTypeQuote"), icon: Quote, shortcut: ">", onSelect: () => insertBlock("blockquote") },
          { label: t("blockTypeBulletList"), icon: List, shortcut: "-", onSelect: () => insertBlock("bulletList") },
          { label: t("blockTypeNumberedList"), icon: ListOrdered, shortcut: "1.", onSelect: () => insertBlock("orderedList") },
          { label: t("blockTypeTodoList"), icon: ListChecks, shortcut: "[]", onSelect: () => {}, disabled: true },
          { label: t("blockTypeCode"), icon: Code2, shortcut: "```", onSelect: () => insertBlock("codeBlock") },
          { label: t("blockTypeDivider"), icon: Minus, shortcut: "---", onSelect: () => insertBlock("horizontalRule") },
          { label: t("blockTypeMindMap"), icon: GitFork, onSelect: () => insertBlock("mindMap") },
        ],
      },
      {
        key: "ai",
        title: t("blockSectionLyranote"),
        items: [
          { label: t("blockAIContinue"), icon: Pen, badge: "新", onSelect: () => dispatchBlockAction("continue", editor?.getText() ?? "") },
          { label: t("blockAISummarize"), icon: Sparkles, badge: "新", onSelect: () => dispatchBlockAction("summarize", editor?.getText() ?? "") },
        ],
      },
    ];
  }, [dispatchBlockAction, editor, insertBlock, t]);

  const filteredActionGroups = useMemo(() => {
    if (!search.trim()) return actionGroups;
    const term = search.trim().toLowerCase();
    return actionGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLowerCase().includes(term)),
      }))
      .filter((group) => group.items.length > 0);
  }, [actionGroups, search]);

  const filteredInsertGroups = useMemo(() => {
    if (!search.trim()) return insertGroups;
    const term = search.trim().toLowerCase();
    return insertGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLowerCase().includes(term)),
      }))
      .filter((group) => group.items.length > 0);
  }, [insertGroups, search]);

  if (!editor || !editor.isEditable) return null;

  return (
    <div
      onMouseEnter={clearHideTimer}
      onMouseLeave={() => {
        if (!anyMenuOpen) {
          hideTimerRef.current = setTimeout(() => setHoverBlock(null), 180);
        }
      }}
    >
      <AnimatePresence>
        {menuMode === "actions" && block && (
          <m.div
            key={`block-overlay-${block.pos}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-10 rounded-xl"
            {...(() => {
              const insets = getHighlightInsets(block);
              return {
                style: {
                  top: block.top - insets.top,
                  left: block.left - insets.left,
                  width: block.width + insets.left + insets.right,
                  height: block.height + insets.top + insets.bottom,
                  backgroundColor: "rgba(255,255,255,0.045)",
                  outline: "1px solid rgba(255,255,255,0.08)",
                },
              };
            })()}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {block && (
          <m.div
            key={anyMenuOpen ? "anchored" : "hover"}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -3 }}
            transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.5 }}
            className="absolute z-20 flex items-center gap-1"
            style={{ top: block.handleTop, left: HANDLE_LEFT }}
          >
            <HandleButton
              label={t("blockInsert")}
              onClick={() => {
                const targetBlock = block ?? hoverBlock;
                if (!editor || !targetBlock) return;

                const blockStart = targetBlock.pos - 1;
                const blockNode = editor.state.doc.nodeAt(blockStart);
                if (!blockNode) return;
                const insertPos = blockStart + blockNode.nodeSize;

                editor.chain()
                  .insertContentAt(insertPos, { type: "paragraph" })
                  .focus(insertPos + 1)
                  .run();

                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    const editorDom = editor.view.dom as HTMLElement;
                    let newParaDom: HTMLElement | null = null;

                    try {
                      const nd = editor.view.nodeDOM(insertPos);
                      if (nd instanceof HTMLElement && editorDom.contains(nd)) {
                        newParaDom = nd;
                      }
                    } catch { /* ignore */ }

                    if (!newParaDom) {
                      try {
                        const sel = editor.state.selection;
                        const domAtSel = editor.view.domAtPos(sel.from);
                        let el = domAtSel.node as HTMLElement;
                        while (el && el.parentElement !== editorDom) {
                          el = el.parentElement as HTMLElement;
                        }
                        if (el && el !== editorDom && editorDom.contains(el)) {
                          newParaDom = el;
                        }
                      } catch { /* ignore */ }
                    }

                    if (newParaDom) {
                      const rect = newParaDom.getBoundingClientRect();
                      const pos = editor.view.posAtDOM(newParaDom, 0);
                      const blockRect = getBlockRect(newParaDom, editorDom);
                      setAnchoredBlock({
                        pos,
                        domEl: newParaDom,
                        top: blockRect.top,
                        left: blockRect.left,
                        width: blockRect.width,
                        height: blockRect.height,
                        handleTop: blockRect.handleTop,
                      });
                      setMenuPos(getInsertMenuPositionBelowBlock(rect));
                      setMenuMode("insert");
                      setSubmenuMode(null);
                      setSearch("");
                    }
                  });
                });
              }}
              data-testid="block-handle-add-button"
            >
              <Plus size={16} />
            </HandleButton>
            <HandleButton
              label={t("blockMenu")}
              onClick={() => anchorBlock(block ?? hoverBlock, "actions")}
              data-testid="block-handle-menu-button"
            >
              <GripVertical size={16} />
            </HandleButton>
          </m.div>
        )}
      </AnimatePresence>

      {createPortal(
        <>
          <AnimatePresence>
            {menuMode === "actions" && menuPos && (
              <MenuPanel
                ref={menuRef}
                width={ACTION_MENU_WIDTH}
                position={menuPos}
                data-testid="block-action-menu"
                motionVariant="fromLeft"
              >
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder={t("blockSearch")}
                />
                <div className="max-h-[360px] overflow-y-auto px-2 pb-2">
                  {filteredActionGroups.map((group, groupIndex) => (
                    <div key={group.key} className="pt-2">
                      {groupIndex > 0 && <Divider />}
                      <div className="space-y-1">
                        {group.items.map((item) => (
                          <BlockMenuRow
                            key={`${group.key}-${item.label}`}
                            item={item}
                            active={item.type === "submenu" && submenuMode === item.submenu}
                            onMouseEnter={() => {
                              if (item.type === "submenu") setSubmenuMode(item.submenu);
                              else setSubmenuMode(null);
                            }}
                            onClick={() => {
                              if (item.type === "submenu") setSubmenuMode(item.submenu);
                              else item.onSelect();
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {filteredActionGroups.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground/55">{t("blockNoResults")}</p>
                  )}
                </div>
              </MenuPanel>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {menuMode === "insert" && menuPos && (
              <MenuPanel
                ref={menuRef}
                width={INSERT_MENU_WIDTH}
                position={menuPos}
                data-testid="block-insert-menu"
                motionVariant="fromTop"
              >
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder={t("blockSearch")}
                />
                <div className="max-h-[220px] overflow-y-auto px-2 pb-2">
                  {filteredInsertGroups.map((group) => (
                    <div key={group.key} className="pt-2">
                      <SectionLabel>{group.title}</SectionLabel>
                      <div className="space-y-1">
                        {group.items.map((item) => (
                          <InsertRow
                            key={`${group.key}-${item.label}`}
                            label={item.label}
                            icon={item.icon}
                            shortcut={(item as any).shortcut}
                            badge={(item as any).badge}
                            onClick={item.onSelect}
                            disabled={(item as any).disabled}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {filteredInsertGroups.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground/55">{t("blockNoResults")}</p>
                  )}
                </div>
                {/* 固定底部：渐变遮罩 + 关闭菜单 */}
                <div className="relative">
                  {/* 渐变模糊遮罩 */}
                  <div className="pointer-events-none absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-[#252525] to-transparent" />
                  <div className="border-t border-white/5 px-1 py-1">
                    <button
                      type="button"
                      onClick={closeMenus}
                      className="group flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-left text-[14px] text-foreground/85 transition-all duration-75 hover:bg-white/[0.06] hover:text-foreground"
                    >
                      <span>关闭菜单</span>
                      <span className="font-mono text-[12px] text-muted-foreground/40">esc</span>
                    </button>
                  </div>
                </div>
              </MenuPanel>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {menuMode === "actions" && submenuMode && menuPos && (
              <MenuPanel
                ref={submenuRef}
                width={SUBMENU_WIDTH}
                position={{
                  top: clampTop(menuPos.top, SUBMENU_HEIGHT_EST),
                  left: clampLeft(menuPos.left + ACTION_MENU_WIDTH + 8, SUBMENU_WIDTH),
                }}
                data-testid={`block-submenu-${submenuMode}`}
                motionVariant="fromRight"
              >
                {submenuMode === "turnInto" ? (
                  <div className="max-h-[360px] overflow-y-auto px-2 py-2">
                    <SectionLabel>{t("blockTurnInto")}</SectionLabel>
                    <div className="space-y-1">
                      {transformItems.map((item) => (
                        <InsertRow
                          key={item.label}
                          label={item.label}
                          icon={item.icon}
                          onClick={item.onSelect}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-y-auto px-2 py-2">
                    <SectionLabel>{t("blockColorRecent")}</SectionLabel>
                    <ColorRow
                      label={t("blockColorDefaultBackground")}
                      swatch="bg-transparent ring-1 ring-white/10"
                      selected
                    />
                    <Divider className="my-3" />
                    <SectionLabel>{t("blockColorTextLabel")}</SectionLabel>
                    {TEXT_COLORS.map((option) => (
                      <ColorRow
                        key={option.key}
                        label={t(option.labelKey)}
                        swatch={option.swatch}
                        selected={option.selected}
                      />
                    ))}
                    <Divider className="my-3" />
                    <SectionLabel>{t("blockColorBackgroundLabel")}</SectionLabel>
                    {BACKGROUND_COLORS.map((option) => (
                      <ColorRow
                        key={option.key}
                        label={t(option.labelKey)}
                        swatch={option.swatch}
                        selected={option.selected}
                      />
                    ))}
                    <p className="px-2 pb-1 pt-3 text-xs text-muted-foreground/45">{t("blockColorComingSoon")}</p>
                  </div>
                )}
              </MenuPanel>
            )}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </div>
  );
}

type MotionVariant = "fromLeft" | "fromTop" | "fromRight";

type MenuVariantConfig = {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
  transition: Transition;
};

const MENU_VARIANTS: Record<MotionVariant, MenuVariantConfig> = {
  fromLeft: {
    initial: { opacity: 0, x: -6, scale: 0.97 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: -4, scale: 0.97, transition: { duration: 0.1, ease: [0.4, 0, 1, 1] } },
    transition: { type: "spring", stiffness: 380, damping: 28, mass: 0.6 },
  },
  fromTop: {
    initial: { opacity: 0, y: -6, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -4, scale: 0.96, transition: { duration: 0.1, ease: [0.4, 0, 1, 1] } },
    transition: { type: "spring", stiffness: 360, damping: 26, mass: 0.55 },
  },
  fromRight: {
    initial: { opacity: 0, x: 8 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 4, transition: { duration: 0.08, ease: [0.4, 0, 1, 1] } },
    transition: { type: "spring", stiffness: 400, damping: 30 },
  },
};

type MenuPanelProps = {
  children?: React.ReactNode;
  className?: string;
  position: { top: number; left: number };
  width: number;
  style?: React.CSSProperties;
  motionVariant?: MotionVariant;
  [key: `data-${string}`]: string | undefined;
};

const MenuPanel = forwardRef<HTMLDivElement, MenuPanelProps>(function MenuPanel(
  {
    children,
    className,
    position,
    style,
    width,
    motionVariant,
    ...props
  },
  ref,
) {
  const mv = motionVariant ? MENU_VARIANTS[motionVariant] : null;
  return (
    <m.div
      ref={ref}
      {...props}
      initial={mv ? mv.initial : { opacity: 0 }}
      animate={mv ? mv.animate : { opacity: 1 }}
      exit={mv ? mv.exit : { opacity: 0 }}
      transition={mv ? mv.transition : { duration: 0.12 }}
      style={{ transformOrigin: "top left", top: position.top, left: position.left, width, ...style }}
      className={cn(
        "fixed isolate z-[2147483646] overflow-hidden rounded-[12px] border border-white/10 bg-[#252525] shadow-[0_4px_20px_rgba(0,0,0,0.6)] py-1",
        className,
      )}
    >
      {children}
    </m.div>
  );
});

function SearchBar({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="border-b border-white/5 px-2 py-2">
      <div className="flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.04] bg-[#2d2d2d] px-2.5 transition-colors focus-within:border-white/10 focus-within:bg-[#333]">
        <Search size={14} className="text-muted-foreground/45 shrink-0" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          data-testid="block-menu-search"
          className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40"
        />
      </div>
    </div>
  );
}

function BlockMenuRow({
  active = false,
  item,
  onClick,
  onMouseEnter,
}: {
  active?: boolean;
  item: BlockMenuItem;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const tone =
    item.type === "action" && item.tone === "danger"
      ? "text-foreground/80 hover:bg-red-500/10 hover:text-red-400 group-hover:text-red-400"
      : item.type === "action" && item.tone === "ai"
        ? "text-foreground/80 hover:bg-primary/10 hover:text-primary group-hover:text-primary"
        : "text-foreground/80 hover:text-foreground";

  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "group flex w-full items-center gap-2 rounded-[6px] px-2 py-1 text-left text-[13px] font-medium transition-all duration-75",
        active ? "bg-white/[0.08]" : "hover:bg-white/[0.05]",
        tone,
        item.disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <item.icon size={14} className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
      <span className="flex-1">{item.label}</span>
      {item.shortcut && <span className="text-[11px] text-muted-foreground/45">{item.shortcut}</span>}
      {item.type === "submenu" && <ChevronRight size={14} className="text-muted-foreground/55" />}
    </button>
  );
}

function InsertRow({
  disabled = false,
  icon: Icon,
  label,
  shortcut,
  badge,
  onClick,
}: {
  disabled?: boolean;
  icon: any;
  label: string;
  shortcut?: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left text-[14px] text-foreground/85 transition-all duration-75 hover:bg-white/[0.06] hover:text-foreground",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <Icon size={16} className="shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground/90" />
      <span className="flex-1 truncate leading-tight">{label}</span>
      {shortcut && <span className="font-mono text-[12px] tabular-nums text-muted-foreground/30">{shortcut}</span>}
      {badge && <span className="rounded-[4px] bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{badge}</span>}
    </button>
  );
}

function ColorRow({
  label,
  selected = false,
  swatch,
}: {
  label: string;
  selected?: boolean;
  swatch: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground/85">
      <span className={cn("h-7 w-7 rounded-lg border border-white/10", swatch)} />
      <span className="flex-1">{label}</span>
      {selected && <Check size={16} className="text-foreground/80" />}
    </div>
  );
}

function HandleButton({
  children,
  label,
  onClick,
  ...props
}: React.ComponentProps<"button"> & {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
      className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] bg-transparent text-muted-foreground/45 transition-all duration-200 hover:bg-white/[0.08] hover:text-foreground/80"
      {...props}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pb-1.5 pt-1.5 text-[12px] font-medium text-muted-foreground/50">
      {children}
    </p>
  );
}

function Divider({ className }: { className?: string }) {
  return <div className={cn("mx-2 h-px bg-white/8", className)} />;
}

