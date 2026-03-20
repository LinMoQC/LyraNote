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
      const { top: containerTop } =
        editor.view.dom.getBoundingClientRect();
      const scrollParent = editor.view.dom.closest(
        ".overflow-y-auto"
      ) as HTMLElement | null;
      const scrollTop = scrollParent?.scrollTop ?? 0;

      // Find which heading is closest above the current scroll position
      let active = headings[0].id;
      for (const h of headings) {
        try {
          const domNode = editor.view.domAtPos(h.pos + 1).node;
          const el =
            domNode instanceof Element ? domNode : (domNode as Node).parentElement;
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.top - containerTop <= scrollTop + 120) active = h.id;
        } catch {
          // domAtPos may throw for detached nodes during editor updates
        }
      }
      setActiveId(active);
    };

    const scrollParent = editor.view.dom.closest(
      ".overflow-y-auto"
    ) as HTMLElement | null;
    scrollParent?.addEventListener("scroll", update, { passive: true });
    update();
    return () =>
      scrollParent?.removeEventListener("scroll", update);
  }, [editor, headings]);

  return activeId;
}

export function NotebookTOC({ editor }: { editor: Editor | null }) {
  const t = useTranslations("notebook");
  const headings = useEditorHeadings(editor);
  const activeId = useActiveHeading(editor, headings);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToHeading = (h: HeadingItem) => {
    if (!editor) return;
    try {
      const domInfo = editor.view.domAtPos(h.pos + 1);
      const rawNode = domInfo.node;
      const el =
        rawNode instanceof Element
          ? rawNode
          : rawNode.parentElement;
      if (!el) return;
      const scrollParent = editor.view.dom.closest(
        ".overflow-y-auto"
      ) as HTMLElement | null;
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        scrollParent.scrollTo({
          top:
            scrollParent.scrollTop + elRect.top - parentRect.top - 80,
          behavior: "smooth",
        });
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch {
      // domAtPos may throw for detached nodes during editor updates
    }
  };

  if (!headings.length) {
    return (
      <div className="flex h-full w-[180px] flex-shrink-0 flex-col items-center justify-center gap-2 px-4 py-8">
        <AlignLeft size={16} className="text-muted-foreground/20" />
        <p className="text-center text-[11px] text-muted-foreground/30">
          {t("tocEmpty")}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full w-[180px] flex-shrink-0 flex-col overflow-y-auto border-l border-border/30 py-6"
    >
      <div className="mb-3 flex items-center gap-1.5 px-4">
        <AlignLeft size={11} className="text-muted-foreground/40" />
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
          {t("toc")}
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {headings.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => scrollToHeading(h)}
            className={cn(
              "group flex w-full items-start rounded-md px-2 py-1 text-left transition-colors",
              activeId === h.id
                ? "bg-accent/60 text-foreground"
                : "text-muted-foreground/50 hover:bg-muted/40 hover:text-muted-foreground/80"
            )}
            style={{
              paddingLeft: `${(h.level - 1) * 10 + 8}px`,
            }}
          >
            {/* Active indicator bar */}
            {activeId === h.id && (
              <span className="mr-1.5 mt-[5px] h-2 w-0.5 flex-shrink-0 rounded-full bg-violet-400" />
            )}
            <span
              className={cn(
                "line-clamp-2 leading-5",
                h.level === 1 ? "text-[12px] font-medium" : "text-[11px]"
              )}
            >
              {h.text}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
