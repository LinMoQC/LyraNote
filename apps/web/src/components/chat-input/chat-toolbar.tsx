"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Book,
  FlaskConical,
  Lightbulb,
  Paperclip,
  Plus,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { Notebook } from "@/types";

export type ChatToolbarMode = "quick" | "deep";

export interface ChatToolbarToolItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface ChatToolbarProps {
  onFileClick: () => void;
  isDeepResearch: boolean;
  onToggleDeepResearch: () => void;
  drMode: ChatToolbarMode;
  onDrModeChange: (mode: ChatToolbarMode) => void;
  isThinkingModel: boolean;
  thinkingEnabled: boolean;
  onToggleThinking: () => void;
  onMenuOpenChange?: (open: boolean) => void;

  tools?: ChatToolbarToolItem[];
  selectedToolId?: string | null;
  onToolSelect?: (id: string | null) => void;
  toolsLabel?: string;

  notebooks?: Notebook[];
  selectedNotebook?: Notebook | null;
  onNotebookSelect?: (notebook: Notebook | null) => void;
  notebookLabel?: string;
  notebookEmptyLabel?: string;
  clearNotebookLabel?: string;
}

interface SecondaryPanelLayout {
  side: "left" | "right";
  width: number;
  maxHeight: number;
}

function getSecondaryPanelLayout(anchor: HTMLDivElement | null, preferredWidth: number): SecondaryPanelLayout {
  if (!anchor || typeof window === "undefined") {
    return { side: "right", width: preferredWidth, maxHeight: 320 };
  }
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gap = 8;
  const edge = 12;

  const rightSpace = viewportWidth - rect.right - gap - edge;
  const leftSpace = rect.left - gap - edge;
  const minUsableWidth = Math.min(preferredWidth, 180);
  let side: "left" | "right" = "right";

  // Prefer opening to the right; only flip when the right side is too tight
  // and the left side can provide a meaningfully better width.
  if (rightSpace < minUsableWidth && leftSpace > rightSpace) {
    side = "left";
  }

  // If both sides are tight, pick the wider side to reduce clipping.
  if (rightSpace < minUsableWidth && leftSpace < minUsableWidth) {
    side = rightSpace >= leftSpace ? "right" : "left";
  }

  const pickedSpace = Math.max(0, side === "right" ? rightSpace : leftSpace);

  return {
    side,
    width: Math.max(0, Math.min(preferredWidth, pickedSpace)),
    maxHeight: Math.max(180, Math.floor(viewportHeight - rect.top - edge)),
  };
}

export function ChatToolbar({
  onFileClick,
  isDeepResearch,
  onToggleDeepResearch,
  drMode,
  onDrModeChange,
  isThinkingModel,
  thinkingEnabled,
  onToggleThinking,
  onMenuOpenChange,
  tools,
  selectedToolId,
  onToolSelect,
  toolsLabel,
  notebooks,
  selectedNotebook,
  onNotebookSelect,
  notebookLabel,
  notebookEmptyLabel,
  clearNotebookLabel,
}: ChatToolbarProps) {
  const t = useTranslations("chat");
  const [menuOpen, setMenuOpen] = useState(false);
  const [drDropdownOpen, setDrDropdownOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [notebooksMenuOpen, setNotebooksMenuOpen] = useState(false);
  const [toolsPanelLayout, setToolsPanelLayout] = useState<SecondaryPanelLayout>({
    side: "right",
    width: 224,
    maxHeight: 320,
  });
  const [notebooksPanelLayout, setNotebooksPanelLayout] = useState<SecondaryPanelLayout>({
    side: "right",
    width: 256,
    maxHeight: 320,
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const drRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const notebooksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onMenuOpenChange?.(menuOpen);
  }, [menuOpen, onMenuOpenChange]);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setToolsMenuOpen(false);
      setNotebooksMenuOpen(false);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!drDropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (drRef.current && !drRef.current.contains(e.target as Node)) setDrDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [drDropdownOpen]);

  useEffect(() => {
    if (!toolsMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsMenuOpen(false);
    };
    const handleResize = () => {
      setToolsPanelLayout(getSecondaryPanelLayout(toolsRef.current, 224));
    };
    handleResize();
    document.addEventListener("mousedown", handle);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handle);
      window.removeEventListener("resize", handleResize);
    };
  }, [toolsMenuOpen]);

  useEffect(() => {
    if (!notebooksMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (notebooksRef.current && !notebooksRef.current.contains(e.target as Node)) setNotebooksMenuOpen(false);
    };
    const handleResize = () => {
      setNotebooksPanelLayout(getSecondaryPanelLayout(notebooksRef.current, 256));
    };
    handleResize();
    document.addEventListener("mousedown", handle);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handle);
      window.removeEventListener("resize", handleResize);
    };
  }, [notebooksMenuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const hasTools = !!(tools?.length && onToolSelect);
  const hasNotebooks = !!(notebooks && onNotebookSelect);
  const selectedTool = hasTools ? tools!.find((tool) => tool.id === selectedToolId) : null;
  const selectedNotebookTitle = selectedNotebook?.title ?? null;
  const primaryItemClass =
    "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/55";

  return (
    <div className="flex items-center gap-2">
      {/* "+" trigger */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/40 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus size={16} strokeWidth={1.5} />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <m.div
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-visible rounded-2xl border border-border/40 bg-card p-2 shadow-xl"
            >
              <button
                type="button"
                onClick={() => { onFileClick(); closeMenu(); }}
                className={primaryItemClass}
              >
                <span className="flex items-center gap-3.5">
                  <Paperclip size={16} className="text-muted-foreground/60" />
                  {t("addFile")}
                </span>
              </button>

              <div className="my-1.5 border-t border-border/20" />

              <button
                type="button"
                onClick={() => { onToggleDeepResearch(); closeMenu(); }}
                className={primaryItemClass}
              >
                <span className="flex items-center gap-3.5">
                  <FlaskConical size={16} className="text-muted-foreground/60" />
                  {t("deepResearchLabel")}
                </span>
                {isDeepResearch && <span className="text-primary">✓</span>}
              </button>

              {isThinkingModel && (
                <>
                  <button
                    type="button"
                    onClick={() => { onToggleThinking(); closeMenu(); }}
                    className={primaryItemClass}
                  >
                    <span className="flex items-center gap-3.5">
                      <Lightbulb size={16} className="text-muted-foreground/60" />
                      {t("thinkingModeLabel")}
                    </span>
                    {thinkingEnabled && <span className="text-primary">✓</span>}
                  </button>
                </>
              )}

              {hasTools && (
                <>
                  <div
                    ref={toolsRef}
                    className="relative"
                    onMouseEnter={() => setToolsMenuOpen(true)}
                    onMouseLeave={() => setToolsMenuOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => setToolsMenuOpen((v) => !v)}
                      className={primaryItemClass}
                    >
                      <span className="flex items-center gap-3.5">
                        <Sparkles size={16} className="text-muted-foreground/60" />
                        {toolsLabel ?? "Tools"}
                      </span>
                      <ChevronRight size={16} className="text-muted-foreground/60" />
                    </button>

                    <AnimatePresence>
                      {toolsMenuOpen && (
                        <m.div
                          initial={{ opacity: 0, x: 6, scale: 0.98 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 6, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                          className={cn(
                            "absolute top-0 z-50 flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-card shadow-xl",
                            toolsPanelLayout.side === "right" ? "left-full ml-2" : "right-full mr-2",
                          )}
                          style={{
                            width: `${toolsPanelLayout.width}px`,
                            maxHeight: `${toolsPanelLayout.maxHeight}px`,
                          }}
                        >
                          <p className="px-4 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {toolsLabel ?? "Tools"}
                          </p>
                          <div className="flex-1 overflow-y-auto">
                            {tools!.map((tool) => {
                              const active = selectedToolId === tool.id;
                              return (
                                <button
                                  key={tool.id}
                                  type="button"
                                  onClick={() => {
                                    onToolSelect?.(active ? null : tool.id);
                                    setToolsMenuOpen(false);
                                    closeMenu();
                                  }}
                                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/50"
                                >
                                  <span className="flex items-center gap-3 min-w-0">
                                    <tool.icon size={14} className="text-muted-foreground/60" />
                                    <span className="truncate">{tool.label}</span>
                                  </span>
                                  {active && <span className="text-primary">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}

              {hasNotebooks && (
                <>
                  <div
                    ref={notebooksRef}
                    className="relative"
                    onMouseEnter={() => setNotebooksMenuOpen(true)}
                    onMouseLeave={() => setNotebooksMenuOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => setNotebooksMenuOpen((v) => !v)}
                      className={primaryItemClass}
                    >
                      <span className="flex items-center gap-3.5">
                        <Book size={16} className="text-muted-foreground/60" />
                        {notebookLabel ?? "Notebook"}
                      </span>
                      <ChevronRight size={16} className="text-muted-foreground/60" />
                    </button>

                    <AnimatePresence>
                      {notebooksMenuOpen && (
                        <m.div
                          initial={{ opacity: 0, x: 6, scale: 0.98 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 6, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                          className={cn(
                            "absolute top-0 z-50 flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-card shadow-xl",
                            notebooksPanelLayout.side === "right" ? "left-full ml-2" : "right-full mr-2",
                          )}
                          style={{
                            width: `${notebooksPanelLayout.width}px`,
                            maxHeight: `${notebooksPanelLayout.maxHeight}px`,
                          }}
                        >
                          <p className="px-4 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {notebookLabel ?? "Notebook"}
                          </p>
                          {selectedNotebook && (
                            <button
                              type="button"
                              onClick={() => {
                                onNotebookSelect?.(null);
                                setNotebooksMenuOpen(false);
                                closeMenu();
                              }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/50"
                            >
                              <X size={14} className="text-muted-foreground/60" />
                              {clearNotebookLabel ?? "Clear notebook filter"}
                            </button>
                          )}
                          {notebooks!.length === 0 ? (
                            <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground/50">
                              {notebookEmptyLabel ?? "No notebooks yet"}
                            </p>
                          ) : (
                            <div className="flex-1 overflow-y-auto">
                              {notebooks!.map((nb) => {
                                const active = selectedNotebook?.id === nb.id;
                                return (
                                  <button
                                    key={nb.id}
                                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/50"
                                    onClick={() => {
                                      onNotebookSelect?.(nb);
                                      setNotebooksMenuOpen(false);
                                      closeMenu();
                                    }}
                                    type="button"
                                  >
                                    <span className="flex min-w-0 items-center gap-3">
                                      <Book size={14} className="text-muted-foreground/60" />
                                      <span className="min-w-0 flex-1 truncate text-left">{nb.title}</span>
                                    </span>
                                    {active ? <span className="text-primary">✓</span> : null}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* Deep Research pill: 默认显示 icon，hover 时同位置变为取消 X */}
      {isDeepResearch && (
        <div ref={drRef} className="group relative flex items-center rounded-full text-foreground/70 transition-colors hover:bg-sky-400/15 hover:text-sky-400">
          <button
            type="button"
            onClick={onToggleDeepResearch}
            className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full [&:hover_.cancel-hover-bg]:bg-sky-400/20"
            title={t("switchToNormal")}
          >
            <span className="cancel-hover-bg pointer-events-none absolute inset-0 m-auto h-5 w-5 rounded-full transition-colors" aria-hidden />
            <FlaskConical size={14} className="text-foreground/50 transition-opacity group-hover:pointer-events-none group-hover:opacity-0" />
            <span className="absolute inset-0 flex items-center justify-center">
              <X size={14} className="text-foreground/50 opacity-0 transition-opacity group-hover:text-sky-400/80 group-hover:opacity-100" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDrDropdownOpen((v) => !v)}
            className="flex flex-1 items-center gap-1.5 py-1.5 pl-0.5 pr-2.5 text-[13px] transition-colors min-w-0"
          >
            <span className="truncate">{t("deepResearchLabel")}</span>
            <ChevronDown size={14} className={cn("flex-shrink-0 text-foreground/50 transition-transform group-hover:text-sky-400", drDropdownOpen && "rotate-180")} />
          </button>

          <AnimatePresence>
            {drDropdownOpen && (
              <m.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full left-0 z-50 mb-1.5 w-48 overflow-hidden rounded-2xl border border-border/40 bg-card p-2 shadow-xl"
              >
                <p className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground/60">{t("drVersion")}</p>
                <button
                  type="button"
                  onClick={() => { onDrModeChange("quick"); setDrDropdownOpen(false); }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-foreground/90 transition-colors hover:bg-accent/55"
                >
                  {t("quickMode")}
                  {drMode === "quick" && <span className="text-primary">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => { onDrModeChange("deep"); setDrDropdownOpen(false); }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-foreground/90 transition-colors hover:bg-accent/55"
                >
                  {t("deepMode")}
                  {drMode === "deep" && <span className="text-primary">✓</span>}
                </button>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Thinking Mode pill — 与深度研究一致：外层 group，默认 icon、hover 时变 X；整颗可点关闭 */}
      {isThinkingModel && thinkingEnabled && (
        <button
          type="button"
          onClick={onToggleThinking}
          className="group flex items-center rounded-full text-foreground/70 transition-colors hover:bg-sky-400/15 hover:text-sky-400"
          title={t("thinkingOff")}
        >
          <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center [&_.cancel-hover-bg]:transition-colors group-hover:[&_.cancel-hover-bg]:bg-sky-400/20">
            <span className="cancel-hover-bg pointer-events-none absolute inset-0 m-auto h-5 w-5 rounded-full" aria-hidden />
            <Lightbulb size={14} className="text-foreground/50 transition-opacity group-hover:pointer-events-none group-hover:opacity-0" />
            <span className="absolute inset-0 flex items-center justify-center">
              <X size={14} className="text-foreground/50 opacity-0 transition-opacity group-hover:text-sky-400/80 group-hover:opacity-100" />
            </span>
          </span>
          <span className="py-1.5 pl-0.5 pr-2.5 text-[13px]">{t("thinkingModeLabel")}</span>
        </button>
      )}

      {selectedTool && (
        <button
          type="button"
          onClick={() => onToolSelect?.(null)}
          className="group flex items-center rounded-full text-foreground/70 transition-colors hover:bg-sky-400/15 hover:text-sky-400"
          title={selectedTool.label}
        >
          <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center [&_.cancel-hover-bg]:transition-colors group-hover:[&_.cancel-hover-bg]:bg-sky-400/20">
            <span className="cancel-hover-bg pointer-events-none absolute inset-0 m-auto h-5 w-5 rounded-full" aria-hidden />
            <selectedTool.icon size={14} className="text-foreground/50 transition-opacity group-hover:pointer-events-none group-hover:opacity-0" />
            <span className="absolute inset-0 flex items-center justify-center">
              <X size={14} className="text-foreground/50 opacity-0 transition-opacity group-hover:text-sky-400/80 group-hover:opacity-100" />
            </span>
          </span>
          <span className="py-1.5 pl-0.5 pr-2.5 text-[13px]">{selectedTool.label}</span>
        </button>
      )}

      {selectedNotebookTitle && (
        <button
          type="button"
          onClick={() => onNotebookSelect?.(null)}
          className="group flex items-center rounded-full text-foreground/70 transition-colors hover:bg-sky-400/15 hover:text-sky-400"
          title={selectedNotebookTitle}
        >
          <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center [&_.cancel-hover-bg]:transition-colors group-hover:[&_.cancel-hover-bg]:bg-sky-400/20">
            <span className="cancel-hover-bg pointer-events-none absolute inset-0 m-auto h-5 w-5 rounded-full" aria-hidden />
            <Book size={14} className="text-foreground/50 transition-opacity group-hover:pointer-events-none group-hover:opacity-0" />
            <span className="absolute inset-0 flex items-center justify-center">
              <X size={14} className="text-foreground/50 opacity-0 transition-opacity group-hover:text-sky-400/80 group-hover:opacity-100" />
            </span>
          </span>
          <span className="max-w-[120px] truncate py-1.5 pl-0.5 pr-2.5 text-[13px]">{selectedNotebookTitle}</span>
        </button>
      )}
    </div>
  );
}
