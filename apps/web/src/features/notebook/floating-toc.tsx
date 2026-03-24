"use client";

import type { Editor } from "@tiptap/react";
import { AnimatePresence, m } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3;
  pos: number;
  index: number;
}

function useEditorToc(editor: Editor | null) {
  const [items, setItems] = useState<TocItem[]>([]);

  useEffect(() => {
    if (!editor) return;

    const extract = () => {
      const result: TocItem[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading" && node.textContent.trim()) {
          result.push({
            id: `h-${pos}`,
            level: node.attrs.level as 1 | 2 | 3,
            text: node.textContent,
            pos,
            index: result.length,
          });
        }
      });
      setItems(result);
    };

    extract();
    editor.on("update", extract);
    return () => { editor.off("update", extract); };
  }, [editor]);

  return items;
}

function useActiveHeading(editor: Editor | null, items: TocItem[]) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!editor || !items.length) return;

    const update = () => {
      const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null;
      const scrollTop = scrollParent?.scrollTop ?? 0;
      const scrollHeight = scrollParent?.scrollHeight ?? 0;
      const clientHeight = scrollParent?.clientHeight ?? 0;

      if (scrollTop < 50) {
        setActiveId(items[0].id);
        return;
      }

      if (scrollHeight - scrollTop - clientHeight < 40) {
        setActiveId(items[items.length - 1].id);
        return;
      }

      const allHeadings = Array.from(editor.view.dom.querySelectorAll("h1,h2,h3,h4,h5,h6"));
      const containerTop = editor.view.dom.getBoundingClientRect().top;

      let active = items[0].id;
      for (let i = 0; i < items.length; i++) {
        const el = allHeadings[items[i].index] as HTMLElement | undefined;
        if (!el) continue;
        if (el.getBoundingClientRect().top - containerTop <= scrollTop + 120) active = items[i].id;
      }
      setActiveId(active);
    };

    const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null;
    scrollParent?.addEventListener("scroll", update, { passive: true });
    update();
    return () => scrollParent?.removeEventListener("scroll", update);
  }, [editor, items]);

  return activeId;
}

export function FloatingTOC({ editor }: { editor: Editor | null }) {
  const items = useEditorToc(editor);
  const activeId = useActiveHeading(editor, items);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(false), 300);
  }, []);

  const scrollTo = useCallback((item: TocItem) => {
    if (!editor) return;
    try {
      const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null;
      if (item.index === 0) {
        scrollParent?.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const allHeadings = Array.from(
        editor.view.dom.querySelectorAll("h1, h2, h3, h4, h5, h6")
      );
      const el = allHeadings[item.index] as HTMLElement | undefined;
      if (!el) return;
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        scrollParent.scrollTo({ top: scrollParent.scrollTop + elRect.top - parentRect.top - 80, behavior: "smooth" });
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch { /* detached node */ }
  }, [editor]);

  if (items.length < 2) return null;

  return (
    <div
      className="absolute right-0 top-0 hidden h-full w-20 lg:flex lg:items-center lg:justify-center"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {/* Skeleton lines */}
      <m.div
        animate={{ opacity: visible ? 0 : 0.8 }}
        transition={{ duration: 0.15 }}
        className="flex cursor-pointer flex-col gap-3"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "h-[3px] rounded-full transition-colors",
              activeId === item.id ? "bg-primary/80" : "bg-muted-foreground/25",
              item.level === 1 && "w-10",
              item.level === 2 && "ml-1.5 w-7",
              item.level === 3 && "ml-3 w-5",
            )}
          />
        ))}
      </m.div>

      {/* Full TOC panel on hover */}
      <AnimatePresence>
        {visible && (
          <m.div
            key="toc-full"
            initial={{ opacity: 0, scale: 0.96, x: 8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: 8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-2 w-52 rounded-xl border border-border/40 bg-card/95 shadow-xl shadow-black/20 backdrop-blur-md"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            <div className="max-h-[60vh] overflow-y-auto px-3 py-3">
              <nav className="space-y-0.5">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollTo(item)}
                    className={cn(
                      "block w-full cursor-pointer truncate rounded-md px-2 py-1.5 text-left text-[12px] leading-snug transition-colors",
                      item.level === 1 && "font-medium",
                      item.level === 2 && "pl-4",
                      item.level === 3 && "pl-6 text-[11px]",
                      activeId === item.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground/60 hover:bg-muted/30 hover:text-muted-foreground/90",
                    )}
                  >
                    {item.text}
                  </button>
                ))}
              </nav>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
