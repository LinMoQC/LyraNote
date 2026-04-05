"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import type { Editor } from "@tiptap/react";
import { AlignLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface HeadingItem {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  pos: number;
  index: number;
}

function useEditorHeadings(editor: Editor | null): HeadingItem[] {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);

  useEffect(() => {
    if (!editor) return;

    const extract = () => {
      const items: HeadingItem[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading" && node.textContent.trim()) {
          items.push({
            id: `h-${pos}`,
            level: node.attrs.level as 1 | 2 | 3,
            text: node.textContent,
            pos,
            index: items.length,
          });
        }
      });
      setHeadings(items);
    };

    extract();
    editor.on("update", extract);
    return () => { editor.off("update", extract); };
  }, [editor]);

  return headings;
}

function useActiveHeading(
  editor: Editor | null,
  headings: HeadingItem[]
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!editor || !headings.length) return;

    const update = () => {
      const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null;
      const scrollTop = scrollParent?.scrollTop ?? 0;
      const scrollHeight = scrollParent?.scrollHeight ?? 0;
      const clientHeight = scrollParent?.clientHeight ?? 0;

      // At the very top — always first heading
      if (scrollTop < 50) {
        setActiveId(headings[0].id);
        return;
      }

      // Near the bottom — activate the last heading
      if (scrollHeight - scrollTop - clientHeight < 40) {
        setActiveId(headings[headings.length - 1].id);
        return;
      }

      const allHeadings = Array.from(
        editor.view.dom.querySelectorAll("h1,h2,h3,h4,h5,h6")
      );
      const containerTop = editor.view.dom.getBoundingClientRect().top;

      let active = headings[0].id;
      for (let i = 0; i < headings.length; i++) {
        const el = allHeadings[headings[i].index] as HTMLElement | undefined;
        if (!el) continue;
        if (el.getBoundingClientRect().top - containerTop <= scrollTop + 120) {
          active = headings[i].id;
        }
      }
      setActiveId(active);
    };

    const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null;
    scrollParent?.addEventListener("scroll", update, { passive: true });
    update();
    return () => scrollParent?.removeEventListener("scroll", update);
  }, [editor, headings]);

  return activeId;
}

function useReadingProgress(editor: Editor | null): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null;
    if (!scrollParent) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollParent;
      const max = scrollHeight - clientHeight;
      setProgress(max <= 0 ? 100 : Math.round((scrollTop / max) * 100));
    };

    scrollParent.addEventListener("scroll", update, { passive: true });
    update();
    return () => scrollParent.removeEventListener("scroll", update);
  }, [editor]);

  return progress;
}

export function NotebookTOC({
  editor,
  variant = "sidebar",
  onNavigate,
}: {
  editor: Editor | null;
  variant?: "sidebar" | "sheet";
  onNavigate?: () => void;
}) {
  const t = useTranslations("notebook");
  const headings = useEditorHeadings(editor);
  const activeId = useActiveHeading(editor, headings);
  const progress = useReadingProgress(editor);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSheet = variant === "sheet";

  const scrollToHeading = (h: HeadingItem) => {
    if (!editor) return;
    try {
      const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null;
      // First heading — scroll to top
      if (h.index === 0) {
        scrollParent?.scrollTo({ top: 0, behavior: "smooth" });
        onNavigate?.();
        return;
      }
      const allHeadings = Array.from(
        editor.view.dom.querySelectorAll("h1, h2, h3, h4, h5, h6")
      );
      const el = allHeadings[h.index] as HTMLElement | undefined;
      if (!el) return;
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        scrollParent.scrollTo({
          top: scrollParent.scrollTop + elRect.top - parentRect.top - 80,
          behavior: "smooth",
        });
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      onNavigate?.();
    } catch { /* detached node */ }
  };

  // Auto-scroll TOC container to keep active item in view
  useEffect(() => {
    if (!activeId || !containerRef.current) return;
    const activeEl = containerRef.current.querySelector(`[data-active="true"]`);
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeId]);

  if (!headings.length) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 px-4",
          isSheet ? "w-full" : "w-[200px] h-[200px] border-l border-border/20",
        )}
        data-testid={`notebook-toc-${variant}`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/30">
          <AlignLeft size={16} className="text-muted-foreground/30" />
        </div>
        <p className="text-center text-[12px] font-medium text-muted-foreground/40">
          {t("tocEmpty")}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col transition-all overflow-hidden bg-muted/5 rounded-2xl",
        isSheet
          ? "w-full max-h-[60vh] px-2"
          : "w-[200px] border border-border/20 max-h-[45vh] my-12",
      )}
      data-testid={`notebook-toc-${variant}`}
    >
      {/* Scrollable list area */}
      <div
        ref={containerRef}
        className="sidebar-scroll flex-1 overflow-y-auto px-1 pt-4 pb-2"
      >
        <nav className="relative flex flex-col">
          {/* Hierarchy Trace Line */}
          {!isSheet && (
            <div className="absolute left-4.5 top-2 bottom-4 w-[1px] bg-border/20" />
          )}

          {headings.map((h) => {
            const isActive = activeId === h.id;
            return (
              <button
                key={h.id}
                type="button"
                data-active={isActive ? "true" : "false"}
                onClick={() => scrollToHeading(h)}
                className={cn(
                  "group relative flex w-full cursor-pointer items-start py-[6px] pr-4 text-left transition-all duration-200",
                  h.level === 1 && "pl-5",
                  h.level === 2 && "pl-8",
                  h.level === 3 && "pl-11",
                  isActive && "bg-violet-400/5",
                )}
              >
                {/* Active Marker on Line */}
                {isActive && !isSheet && (
                  <div className="absolute left-4.5 top-[10px] h-3.5 w-[2.5px] -translate-x-[1px] rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.6)] z-10" />
                )}

                <span
                  className={cn(
                    "line-clamp-2 leading-[1.5] transition-all duration-200",
                    h.level === 1 && "text-[12.5px] font-semibold tracking-tight",
                    h.level === 2 && "text-[12px] font-medium",
                    h.level === 3 && "text-[11.5px]",
                    isActive
                      ? "text-foreground translate-x-1"
                      : "text-muted-foreground/50 group-hover:text-muted-foreground/80 group-hover:translate-x-0.5",
                  )}
                >
                  {h.text}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer: Progress & Back to Top — Stable Left Alignment */}
      <div className="flex items-center px-6 pt-4 pb-5 bg-muted/5 border-t border-border/10">
        <div className="flex items-center gap-3">
          <div className="relative h-4 w-4 flex-shrink-0">
            <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6" fill="none" strokeWidth="1.5" className="stroke-muted/15" />
              <circle
                cx="8" cy="8" r="6"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                className="stroke-violet-400/80 transition-all duration-500 ease-out"
                strokeDasharray={`${2 * Math.PI * 6}`}
                strokeDashoffset={`${2 * Math.PI * 6 * (1 - progress / 100)}`}
              />
            </svg>
          </div>
          <span className="text-[11px] font-bold tabular-nums tracking-wider text-muted-foreground/60">
            {progress}%
          </span>
        </div>

        {/* Back to Top - Pushed to right but doesn't affect progress position */}
        <div className="ml-auto pr-1">
          <AnimatePresence>
            {progress > 5 && (
              <m.button
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 5 }}
                onClick={() => {
                  const scrollParent = editor?.view.dom.closest(".overflow-y-auto") as HTMLElement | null;
                  scrollParent?.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="flex items-center gap-2 text-muted-foreground/40 transition-colors hover:text-violet-400"
              >
                <div className="flex h-4 w-4 items-center justify-center">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M8 12V4M8 4L4 8M8 4L12 8" />
                  </svg>
                </div>
                <span className="text-[10px] font-medium leading-none">{t("scrollToTop")}</span>
              </m.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
