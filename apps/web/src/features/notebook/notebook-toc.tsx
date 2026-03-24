"use client";

import { useEffect, useRef, useState } from "react";
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

export function NotebookTOC({ editor }: { editor: Editor | null }) {
  const t = useTranslations("notebook");
  const headings = useEditorHeadings(editor);
  const activeId = useActiveHeading(editor, headings);
  const progress = useReadingProgress(editor);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToHeading = (h: HeadingItem) => {
    if (!editor) return;
    try {
      const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null;
      // First heading — scroll to top
      if (h.index === 0) {
        scrollParent?.scrollTo({ top: 0, behavior: "smooth" });
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
    } catch { /* detached node */ }
  };

  if (!headings.length) {
    return (
      <div className="flex h-full w-[180px] flex-col items-center justify-center gap-2 border-l border-border/20 px-4">
        <AlignLeft size={14} className="text-muted-foreground/15" />
        <p className="text-center text-[11px] text-muted-foreground/25">
          {t("tocEmpty")}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-[180px] overflow-y-auto border-l border-border/20"
    >
      <nav className="flex flex-col pt-8">
        {headings.map((h) => {
          const isActive = activeId === h.id;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => scrollToHeading(h)}
              className={cn(
                "group relative flex w-full cursor-pointer items-start py-[5px] pr-3 text-left transition-all duration-150",
                h.level === 1 && "pl-4",
                h.level === 2 && "pl-7",
                h.level === 3 && "pl-10",
              )}
            >
              <span
                className={cn(
                  "line-clamp-2 leading-[1.4] transition-colors duration-150",
                  h.level === 1 && "text-[12px] font-medium",
                  h.level === 2 && "text-[11.5px]",
                  h.level === 3 && "text-[11px]",
                  isActive
                    ? "text-foreground/90"
                    : "text-muted-foreground/40 group-hover:text-muted-foreground/70",
                )}
              >
                {isActive && (
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-violet-400" />
                )}
                {h.text}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Reading progress circle — right below the list */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-6">
        <div className="relative h-4 w-4 flex-shrink-0">
          <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" fill="none" strokeWidth="1.5" className="stroke-muted/40" />
            <circle
              cx="8" cy="8" r="6"
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="stroke-violet-400/70 transition-all duration-300"
              strokeDasharray={`${2 * Math.PI * 6}`}
              strokeDashoffset={`${2 * Math.PI * 6 * (1 - progress / 100)}`}
            />
          </svg>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground/35">
          {progress}%
        </span>
      </div>
    </div>
  );
}

