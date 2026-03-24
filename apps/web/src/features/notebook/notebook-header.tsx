"use client";

import {
  ChevronLeft,
  Copy,
  Expand,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Type,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";

import { deleteNotebook, renameNotebook } from "@/services/notebook-service";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type MenuItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  action?: () => void;
  danger?: boolean;
  toggle?: boolean;
  checked?: boolean;
};

export function NotebookTopBar({
  notebookId,
  title: externalTitle,
  saveStatus = "idle",
  onTitleChange,
  isFullscreen = false,
  onToggleFullscreen,
}: {
  notebookId: string;
  title: string;
  saveStatus?: SaveStatus;
  onTitleChange?: (title: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(externalTitle);
  const [isRenaming, setIsRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [smallText, setSmallText] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const titleBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [renamePos, setRenamePos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => setTitle(externalTitle), [externalTitle]);

  useEffect(() => {
    if (isRenaming) {
      if (titleBtnRef.current) {
        const rect = titleBtnRef.current.getBoundingClientRect();
        setRenamePos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 240) });
      }
      setTimeout(() => renameInputRef.current?.select(), 30);
    }
  }, [isRenaming]);

  useEffect(() => {
    if (menuOpen) {
      setSearch("");
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMenu = menuRef.current?.contains(target);
      const inBtn = btnRef.current?.contains(target);
      if (!inMenu && !inBtn) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const commitRename = async () => {
    setIsRenaming(false);
    const trimmed = title.trim();
    if (trimmed && trimmed !== externalTitle) {
      await renameNotebook(notebookId, trimmed);
      onTitleChange?.(trimmed);
    } else {
      setTitle(externalTitle);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (confirm("确认将此笔记本移入回收站？此操作不可恢复。")) {
      await deleteNotebook(notebookId);
      router.push("/app/notebooks");
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setMenuOpen(false);
  };

  const menuItems: MenuItem[] = [
    {
      id: "smallText",
      label: "小号文字",
      icon: Type,
      toggle: true,
      checked: smallText,
      action: () => {
        setSmallText((v) => !v);
        setMenuOpen(false);
      },
    },
    {
      id: "copyLink",
      label: "复制链接",
      icon: Copy,
      action: handleCopyLink,
    },
    {
      id: "rename",
      label: "重命名",
      icon: Pencil,
      action: () => {
        setIsRenaming(true);
        setMenuOpen(false);
      },
    },
    {
      id: "fullscreen",
      label: "全屏",
      icon: Expand,
      toggle: true,
      checked: isFullscreen,
      action: () => {
        onToggleFullscreen?.();
        setMenuOpen(false);
      },
    },
    {
      id: "delete",
      label: "移入回收站",
      icon: Trash2,
      danger: true,
      action: handleDelete,
    },
  ];

  const filtered = useMemo(() => {
    if (!search.trim()) return menuItems;
    return menuItems.filter((item) =>
      item.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, smallText, isFullscreen]);

  const nonDanger = filtered.filter((i) => !i.danger);
  const danger = filtered.filter((i) => i.danger);

  return (
    <div className="flex h-10 flex-shrink-0 items-center bg-card/10 px-3 backdrop-blur-sm">
      {/* Left: back + breadcrumb */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 text-[13px] text-muted-foreground/50">
        <Link
          href="/app/notebooks"
          className="flex items-center gap-0.5 rounded-sm px-1.5 py-1 transition-colors hover:bg-accent/60 hover:text-foreground/80"
        >
          <ChevronLeft size={13} />
          <span>返回</span>
        </Link>
        <span className="px-0.5 text-muted-foreground/30">/</span>

        {isRenaming ? (
          <button
            ref={titleBtnRef}
            type="button"
            className="max-w-[280px] truncate rounded-sm px-1.5 py-1 text-[13px] text-foreground/75 transition-colors hover:bg-accent/60 hover:text-foreground"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setTitle(externalTitle);
              setIsRenaming(false);
            }}
          >
            {title || "无标题笔记本"}
          </button>
        ) : (
          <button
            ref={titleBtnRef}
            type="button"
            className="max-w-[280px] truncate rounded-sm px-1.5 py-1 text-[13px] text-foreground/75 transition-colors hover:bg-accent/60 hover:text-foreground"
            onClick={() => setIsRenaming(true)}
            title="点击重命名"
          >
            {title || "无标题笔记本"}
          </button>
        )}

        {renamePos && createPortal(
          <AnimatePresence>
            {isRenaming && (
              <m.div
                key="rename-popup"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="fixed z-[9999] overflow-hidden rounded-xl border border-border/40 bg-card shadow-2xl shadow-black/30"
                style={{ top: renamePos.top, left: renamePos.left, width: renamePos.width }}
              >
              <div className="px-2 py-2">
                <input
                  ref={renameInputRef}
                  className="w-full rounded-lg bg-muted/40 px-3 py-2 text-[13px] text-foreground outline-none ring-1 ring-primary/40 placeholder:text-muted-foreground/40"
                  placeholder="笔记本名称…"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => {
                    setTitle(externalTitle);
                    setIsRenaming(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRename();
                    }
                    if (e.key === "Escape") {
                      setTitle(externalTitle);
                      setIsRenaming(false);
                    }
                  }}
                />
              </div>
            </m.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
      </div>

      {/* Right: save status + menu */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {saveStatus === "saving" && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/40" />
            保存中…
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
            已保存
          </span>
        )}
        {saveStatus === "error" && (
          <span className="text-[11px] text-red-400/70">保存失败</span>
        )}

        {/* ... menu */}
        <div className="relative">
          <button
            ref={btnRef}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (menuOpen) {
                setMenuOpen(false);
                return;
              }
              if (btnRef.current) {
                const rect = btnRef.current.getBoundingClientRect();
                setMenuPos({
                  top: rect.bottom + 6,
                  right: window.innerWidth - rect.right,
                });
              }
              setMenuOpen(true);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent/60 hover:text-foreground"
            title="更多选项"
          >
            <MoreHorizontal size={15} />
          </button>

          {menuPos && createPortal(
            <AnimatePresence>
              {menuOpen && (
            <m.div
              key="header-menu"
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -6 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="fixed z-[9999] w-60 overflow-hidden rounded-xl border border-border/40 bg-card shadow-2xl shadow-black/30"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              {/* Search */}
              <div className="px-2 pt-2 pb-1.5">
                <div className="flex h-8 items-center gap-2 rounded-lg bg-muted/40 px-2.5">
                  <Search size={12} className="flex-shrink-0 text-muted-foreground/50" />
                  <input
                    ref={searchRef}
                    className="flex-1 bg-transparent text-[12px] text-foreground/80 outline-none placeholder:text-muted-foreground/40"
                    placeholder="搜索操作…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setMenuOpen(false)}
                  />
                </div>
              </div>

              {nonDanger.length > 0 && (
                <>
                  <div className="mx-2 h-px bg-border/30" />
                  <div className="px-1 py-1">
                    {nonDanger.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={item.action}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-foreground/80 transition-colors hover:bg-accent/60"
                      >
                        <span className="flex items-center gap-2.5">
                          <item.icon size={13} className="text-muted-foreground/60" />
                          {item.label}
                        </span>
                        {item.toggle && (
                          <div
                            className={`relative h-4 w-8 rounded-full transition-colors ${item.checked ? "bg-blue-500" : "bg-muted/60"}`}
                          >
                            <div
                              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${item.checked ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {danger.length > 0 && (
                <>
                  <div className="mx-2 h-px bg-border/30" />
                  <div className="px-1 py-1 pb-2">
                    {danger.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={item.action}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <item.icon size={13} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {filtered.length === 0 && (
                <p className="px-4 py-4 text-center text-[12px] text-muted-foreground/40">
                  未找到匹配操作
                </p>
              )}
            </m.div>
              )}
            </AnimatePresence>,
            document.body,
          )}
        </div>
      </div>
    </div>
  );
}
