"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Circle,
  Clock,
  Copy,
  Expand,
  FileText,
  History,
  Languages,
  Library,
  Maximize2,
  MessageSquareQuote,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Type,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";

import { renameNotebook } from "@/services/notebook-service";
import { NotePickerDropdown } from "@/features/notebook/note-picker-dropdown";
import { useUiStore } from "@/store/use-ui-store";
import { cn } from "@/lib/utils";
import type { NotebookAppearanceSettings } from "@/features/notebook/notebook-appearance";
import type { MobileWorkspaceSheetKey } from "@/features/notebook/mobile-workspace-sheet";
import type { NoteRecord } from "@/services/note-service";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type MenuItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  action?: () => void;
  danger?: boolean;
  toggle?: boolean;
  checked?: boolean;
  shortcut?: string;
  badge?: string;
};

export function NotebookTopBar({
  notebookId,
  title: externalTitle,
  saveStatus = "idle",
  onTitleChange,
  isFullscreen = false,
  onToggleFullscreen,
  activeNoteId,
  activeNoteTitle,
  onNoteSelect,
  onNoteCreated,
  onNoteDeleted,
  isMobile = false,
  mobileActiveSheet = "none",
  onMobileSheetChange,
  charCount,
  onToggleSources,
  sourcesOpen = false,
  sourceCount = 0,
  updatedAt,
  appearance,
  onAppearanceChange,
}: {
  notebookId: string;
  title: string;
  saveStatus?: SaveStatus;
  onTitleChange?: (title: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  activeNoteId?: string | null;
  activeNoteTitle?: string | null;
  onNoteSelect?: (note: NoteRecord) => void;
  onNoteCreated?: (note: NoteRecord) => void;
  onNoteDeleted?: (noteId: string) => void;
  isMobile?: boolean;
  mobileActiveSheet?: MobileWorkspaceSheetKey;
  onMobileSheetChange?: (sheet: MobileWorkspaceSheetKey) => void;
  charCount?: number;
  onToggleSources?: () => void;
  sourcesOpen?: boolean;
  sourceCount?: number;
  updatedAt?: string;
  appearance?: NotebookAppearanceSettings;
  onAppearanceChange?: (appearance: NotebookAppearanceSettings) => void;
}) {
  const t = useTranslations("notebook");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [title, setTitle] = useState(externalTitle);
  const [isRenaming, setIsRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const titleBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
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

  const { setSettingsOpen } = useUiStore();

  const isSmallText = appearance?.fontSize === "sm";
  const isWideWidth = appearance?.contentWidth === "wide";

  const toggleAppearance = (key: keyof NotebookAppearanceSettings, value: any) => {
    onAppearanceChange?.({ ...appearance, [key]: value });
  };

  const menuSections = useMemo(() => {
    const style: MenuItem[] = [
      {
        id: "smallText",
        label: t("smallText"),
        icon: Type,
        toggle: true,
        checked: isSmallText,
        action: () => toggleAppearance("fontSize", isSmallText ? "md" : "sm"),
      },
      {
        id: "fullscreen",
        label: t("fullscreen"),
        icon: Expand,
        toggle: true,
        checked: isFullscreen,
        action: () => onToggleFullscreen?.(),
      },
      {
        id: "wideContent",
        label: t("wideContent"),
        icon: Maximize2,
        toggle: true,
        checked: isWideWidth,
        action: () => toggleAppearance("contentWidth", isWideWidth ? "standard" : "wide"),
      },
    ];

    const actions: MenuItem[] = [
      {
        id: "rename",
        label: t("rename"),
        icon: Pencil,
        action: () => {
          setIsRenaming(true);
          setMenuOpen(false);
        },
      },
    ];

    const ai: MenuItem[] = [
      {
        id: "aiSkills",
        label: "AI 技能",
        icon: Sparkles,
        action: () => {
          setSettingsOpen(true, "skills");
          setMenuOpen(false);
        },
      },
      {
        id: "aiEdit",
        label: "与 AI 一起使用",
        icon: Languages,
        action: () => setMenuOpen(false),
      },
    ];

    const extra: MenuItem[] = [
      {
        id: "undo",
        label: "撤销",
        icon: Undo2,
        shortcut: "⌘Z",
        action: () => setMenuOpen(false),
      },
      {
        id: "history",
        label: "版本历史",
        icon: History,
        action: () => setMenuOpen(false),
      },
    ];

    return [
      { id: "style", items: style },
      { id: "actions", items: actions },
      { id: "ai", items: ai },
      { id: "extra", items: extra },
    ];
  }, [
    appearance,
    isSmallText,
    isWideWidth,
    isFullscreen,
    onToggleFullscreen,
    setSettingsOpen,
    t,
  ]);


  const toggleMobileSheet = (sheet: Exclude<MobileWorkspaceSheetKey, "none">) => {
    onMobileSheetChange?.(mobileActiveSheet === sheet ? "none" : sheet);
  };

  if (isMobile) {
    return (
      <div className="flex flex-shrink-0 flex-col border-b border-border/10 bg-background/88 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <Link
            href="/app/notebooks"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border/20 bg-background/70 text-muted-foreground/70 shadow-sm transition-colors hover:bg-accent/60 hover:text-foreground"
            aria-label={t("back")}
          >
            <ChevronLeft size={17} />
          </Link>

          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <button
                ref={titleBtnRef}
                type="button"
                className="min-w-0 truncate rounded-md py-1 text-left text-[20px] font-semibold tracking-tight text-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTitle(externalTitle);
                  setIsRenaming(false);
                }}
              >
                {title || t("untitled")}
              </button>
            ) : (
              <button
                ref={titleBtnRef}
                type="button"
                className="min-w-0 truncate rounded-md py-1 text-left text-[20px] font-semibold tracking-tight text-foreground"
                onClick={() => setIsRenaming(true)}
                title={t("clickToRename")}
              >
                {title || t("untitled")}
              </button>
            )}
          </div>

          {saveStatus !== "idle" && (
            <span
              className="flex h-6 items-center justify-center px-1"
              title={
                saveStatus === "saving"
                  ? tc("saving")
                  : saveStatus === "saved"
                    ? tc("saved")
                    : t("saveFailedShort")
              }
            >
              <span
                className={[
                  "h-2 w-2 rounded-full",
                  saveStatus === "saving" && "animate-pulse bg-muted-foreground/50",
                  saveStatus === "saved" && "bg-emerald-400/80",
                  saveStatus === "error" && "bg-red-400/80",
                ].filter(Boolean).join(" ")}
              />
            </span>
          )}

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
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border/20 bg-background/70 text-muted-foreground/70 shadow-sm transition-colors hover:bg-accent/60 hover:text-foreground"
              title={t("moreOptions")}
            >
              <MoreHorizontal size={16} />
            </button>

            {menuPos && createPortal(
              <AnimatePresence>
                {menuOpen && (
                    <m.div
                      key="header-menu-mobile"
                      ref={menuRef}
                      initial={{ opacity: 0, scale: 0.95, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -6 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className="fixed z-[9999] w-64 overflow-hidden rounded-xl border border-border/40 bg-card shadow-2xl shadow-black/30"
                      style={{ top: menuPos.top, right: menuPos.right }}
                    >
                      <div className="px-1 py-1 pt-2">
                        <div className="flex gap-1 px-1.5 pb-1.5">
                          {(["sans", "serif", "mono"] as const).map((font) => (
                            <button
                              key={font}
                              type="button"
                              onClick={() => toggleAppearance("fontFamily", font)}
                              className={cn(
                                "flex flex-1 flex-col items-center gap-1 rounded-lg py-3 transition-all",
                                appearance?.fontFamily === font
                                  ? "bg-primary/10 text-primary shadow-sm"
                                  : "text-muted-foreground/50 hover:bg-accent/60 hover:text-foreground/80"
                              )}
                            >
                              <span className={cn(
                                "text-[18px] font-medium leading-none",
                                font === "serif" && "font-serif",
                                font === "mono" && "font-mono"
                              )}>Ag</span>
                              <span className="text-[10px] font-medium opacity-80">
                                {font === "sans" && t("fontSans")}
                                {font === "serif" && t("fontSerif")}
                                {font === "mono" && t("fontMono")}
                              </span>
                            </button>
                          ))}
                        </div>
                        <div className="mx-2 mb-1 h-px bg-border/25" />
                      </div>

                      <div className="max-h-[50vh] overflow-y-auto overflow-x-hidden px-1 py-1 hide-scrollbar">
                        {menuSections.map((section, sidx) => (
                          <React.Fragment key={section.id}>
                            {sidx > 0 && <div className="mx-2 my-1 h-px bg-border/15" />}
                            <div className="space-y-0.5">
                              {section.items.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={item.action}
                                  className={cn(
                                    "group flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors",
                                    item.danger
                                      ? "text-red-400/80 hover:bg-red-500/10 hover:text-red-400"
                                      : "text-foreground/80 hover:bg-accent/60"
                                  )}
                                >
                                  <div className="flex min-w-0 items-center gap-2.5">
                                    <item.icon
                                      size={15}
                                      className={cn(
                                        "flex-shrink-0 opacity-60 transition-opacity group-hover:opacity-100",
                                        item.danger && "opacity-80"
                                      )}
                                    />
                                    <span className="truncate">{item.label}</span>
                                  </div>

                                  <div className="flex flex-shrink-0 items-center gap-2">
                                    {item.shortcut && (
                                      <span className="text-[10.5px] font-medium text-muted-foreground/35 transition-colors group-hover:text-muted-foreground/50">
                                        {item.shortcut}
                                      </span>
                                    )}
                                    {item.toggle && (
                                      <div
                                        className={cn(
                                          "relative h-[18px] w-[34px] rounded-full transition-all duration-200",
                                          item.checked ? "bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]" : "bg-muted/60"
                                        )}
                                      >
                                        <div
                                          className={cn(
                                            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                                            item.checked ? "translate-x-4" : "translate-x-0.5"
                                          )}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </React.Fragment>
                        ))}
                      </div>

                      <div className="border-t border-border/15 bg-muted/[0.08] px-3.5 py-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/45">
                            <span className="flex w-[11px] text-[16px] items-center justify-center font-mono opacity-70">#</span>
                            <span>{t("wordCountDetailed", { count: charCount || 0 })}</span>
                          </div>
                          {updatedAt && (
                          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/45">
                            <Clock size={11} className="opacity-70" />
                            <span>
                              {t("lastEditedAt", {
                                time: format.dateTime(new Date(updatedAt), { hour: "2-digit", minute: "2-digit" }),
                              })}
                            </span>
                          </div>
                          )}
                        </div>
                      </div>
                    </m.div>
                )}
              </AnimatePresence>,
              document.body,
            )}
          </div>
        </div>

        <div className="px-4 pb-2">
          {!isRenaming && onNoteSelect && onNoteCreated && onNoteDeleted && (
            <NotePickerDropdown
              notebookId={notebookId}
              activeNoteId={activeNoteId ?? null}
              activeNoteTitle={activeNoteTitle ?? null}
              onSelect={onNoteSelect}
              onCreated={onNoteCreated}
              onDeleted={onNoteDeleted}
              variant="compact"
            />
          )}
          <div className="mt-2 rounded-xl border border-border/10 bg-muted/[0.18] p-1">
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                data-testid="mobile-sheet-trigger-toc"
                onClick={() => toggleMobileSheet("toc")}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium transition-all ${
                  mobileActiveSheet === "toc"
                    ? "bg-background/90 text-foreground shadow-sm shadow-black/10"
                    : "text-muted-foreground/70 hover:text-foreground"
                }`}
              >
                <AlignLeft size={14} />
                <span>{t("toc")}</span>
              </button>
              <button
                type="button"
                data-testid="mobile-sheet-trigger-sources"
                onClick={() => toggleMobileSheet("sources")}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium transition-all ${
                  mobileActiveSheet === "sources"
                    ? "bg-background/90 text-foreground shadow-sm shadow-black/10"
                    : "text-muted-foreground/70 hover:text-foreground"
                }`}
              >
                <Library size={14} />
                <span>{t("tabSources")}</span>
              </button>
              <button
                type="button"
                data-testid="mobile-sheet-trigger-copilot"
                onClick={() => toggleMobileSheet("copilot")}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium transition-all ${
                  mobileActiveSheet === "copilot"
                    ? "bg-background/90 text-foreground shadow-sm shadow-black/10"
                    : "text-muted-foreground/70 hover:text-foreground"
                }`}
              >
                <Sparkles size={14} />
                <span>{t("copilot.title")}</span>
              </button>
            </div>
          </div>
        </div>

        {renamePos && createPortal(
          <AnimatePresence>
            {isRenaming && (
              <m.div
                key="rename-popup-mobile"
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
                    placeholder={t("namePlaceholder")}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => {
                      void commitRename();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename();
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
    );
  }

  return (
    <div className="flex h-10 flex-shrink-0 items-center bg-card/10 px-3 font-notebook-ui backdrop-blur-sm">
      {/* Left: back + breadcrumb */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 text-[13px] font-normal text-muted-foreground/50">
        <Link
          href="/app/notebooks"
          className="flex items-center gap-0.5 rounded-sm px-1.5 py-1 transition-colors hover:bg-accent/60 hover:text-foreground/80"
        >
          <ChevronLeft size={13} />
          <span>{t("back")}</span>
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
            {title || t("untitled")}
          </button>
        ) : (
          <button
            ref={titleBtnRef}
            type="button"
            className="max-w-[280px] truncate rounded-sm px-1.5 py-1 text-[13px] text-foreground/75 transition-colors hover:bg-accent/60 hover:text-foreground"
            onClick={() => setIsRenaming(true)}
            title={t("clickToRename")}
          >
            {title || t("untitled")}
          </button>
        )}

        {/* Note picker: shown only when not renaming */}
        {!isRenaming && onNoteSelect && onNoteCreated && onNoteDeleted && (
          <NotePickerDropdown
            notebookId={notebookId}
            activeNoteId={activeNoteId ?? null}
            activeNoteTitle={activeNoteTitle ?? null}
            onSelect={onNoteSelect}
            onCreated={onNoteCreated}
            onDeleted={onNoteDeleted}
          />
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
                  placeholder={t("namePlaceholder")}
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

      {/* Right: char count + save status + menu */}
      <div className="flex flex-shrink-0 items-center gap-2.5">
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
          <span className="text-[11px] text-red-400/70">{t("saveFailedShort")}</span>
        )}

        {!isMobile && onToggleSources && (
          <div className="flex items-center gap-1.5 pl-1">
            <button
              type="button"
              onClick={onToggleSources}
              className={cn(
                "group flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-all duration-200",
                sourcesOpen
                  ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(var(--primary-rgb),0.1)]"
                  : "text-muted-foreground/55 hover:bg-accent/60 hover:text-foreground"
              )}
              title={t("tabSources")}
            >
              <Library
                size={14}
                className={cn("transition-transform duration-200", sourcesOpen ? "scale-105" : "group-hover:scale-105")}
                strokeWidth={sourcesOpen ? 2.5 : 2}
              />
              {sourceCount >= 0 && (
                <span className={cn(
                  "text-[11px] tabular-nums transition-colors",
                  sourcesOpen ? "text-primary/90" : "text-muted-foreground/35 group-hover:text-foreground/60"
                )}>
                  {sourceCount}
                </span>
              )}
            </button>
            <div className="mx-0.5 h-3.5 w-px bg-border/20" />
          </div>
        )}

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
            title={t("moreOptions")}
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
              className="fixed z-[9999] w-64 overflow-hidden rounded-xl border border-border/40 bg-card shadow-2xl shadow-black/30"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              <div className="px-1 py-1 pt-2">
                <div className="flex gap-1 px-1.5 pb-1.5">
                  {(["sans", "serif", "mono"] as const).map((font) => (
                    <button
                      key={font}
                      type="button"
                      onClick={() => toggleAppearance("fontFamily", font)}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-1 rounded-lg py-3 transition-all",
                        appearance?.fontFamily === font
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "text-muted-foreground/50 hover:bg-accent/60 hover:text-foreground/80"
                      )}
                    >
                      <span className={cn(
                        "text-[18px] font-medium leading-none",
                        font === "serif" && "font-serif",
                        font === "mono" && "font-mono"
                      )}>Ag</span>
                      <span className="text-[10px] font-medium opacity-80">
                        {font === "sans" && t("fontSans")}
                        {font === "serif" && t("fontSerif")}
                        {font === "mono" && t("fontMono")}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mx-2 mb-1 h-px bg-border/25" />
              </div>

              <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden px-1 py-1 hide-scrollbar">
                {menuSections.map((section, sidx) => (
                  <React.Fragment key={section.id}>
                    {sidx > 0 && <div className="mx-2 my-1 h-px bg-border/15" />}
                    <div className="space-y-0.5">
                      {section.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.action}
                          className={cn(
                            "group flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors",
                            item.danger
                              ? "text-red-400/80 hover:bg-red-500/10 hover:text-red-400"
                              : "text-foreground/80 hover:bg-accent/60"
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <item.icon
                              size={15}
                              className={cn(
                                "flex-shrink-0 opacity-60 transition-opacity group-hover:opacity-100",
                                item.danger && "opacity-80"
                              )}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>

                          <div className="flex flex-shrink-0 items-center gap-2">
                            {item.shortcut && (
                              <span className="text-[10.5px] font-medium text-muted-foreground/35 transition-colors group-hover:text-muted-foreground/50">
                                {item.shortcut}
                              </span>
                            )}
                            {item.toggle && (
                              <div
                                className={cn(
                                  "relative h-[18px] w-[34px] rounded-full transition-all duration-200",
                                  item.checked ? "bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]" : "bg-muted/60"
                                )}
                              >
                                <div
                                  className={cn(
                                    "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                                    item.checked ? "translate-x-4" : "translate-x-0.5"
                                  )}
                                />
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </React.Fragment>
                ))}
              </div>

              <div className="border-t border-border/15 bg-muted/[0.08] px-3.5 py-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/45">
                    <span className="flex w-[11px] items-center justify-center font-mono opacity-70 font-[14px]">#</span>
                    <span>{t("wordCountDetailed", { count: charCount || 0 })}</span>
                  </div>
                  {updatedAt && (
                  <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/45">
                    <Clock size={11} className="opacity-70" />
                    <span>
                      {t("lastEditedAt", {
                        time: format.dateTime(new Date(updatedAt), { hour: "2-digit", minute: "2-digit" }),
                      })}
                    </span>
                  </div>
                  )}
                </div>
              </div>
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
