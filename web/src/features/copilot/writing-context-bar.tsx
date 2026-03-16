"use client";

import { AnimatePresence, m } from "framer-motion";
import { BookOpen, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { useState } from "react";
import type { WritingContextChunk } from "@/store/use-proactive-store";

export function WritingContextBar({
  chunks,
  onAskAbout,
  onInsertCitation,
}: {
  chunks: WritingContextChunk[];
  onAskAbout?: (excerpt: string) => void;
  onInsertCitation?: (text: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);

  if (chunks.length === 0) return null;

  return (
    <div className="border-b border-border/20">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
      >
        <BookOpen size={12} className="flex-shrink-0 text-primary/60" />
        <span className="flex-1 text-[11px] font-medium text-muted-foreground/70">
          相关资料 ({chunks.length})
        </span>
        {collapsed ? (
          <ChevronDown size={11} className="text-muted-foreground/40" />
        ) : (
          <ChevronUp size={11} className="text-muted-foreground/40" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 px-3 pb-2.5">
              {chunks.map((chunk) => (
                <div
                  key={chunk.chunk_id}
                  className="rounded-lg border border-border/30 bg-background/50 px-2.5 py-2"
                >
                  <p className="mb-1 text-[10px] font-medium text-primary/60">
                    {chunk.source_title}
                  </p>
                  <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground/60">
                    {chunk.excerpt}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {onInsertCitation && (
                      <button
                        type="button"
                        onClick={() => onInsertCitation(chunk.excerpt.slice(0, 200))}
                        className="text-[10px] text-primary/50 transition-colors hover:text-primary/80"
                      >
                        插入引用
                      </button>
                    )}
                    {onAskAbout && (
                      <button
                        type="button"
                        onClick={() => onAskAbout(`关于「${chunk.source_title}」中提到的：${chunk.excerpt.slice(0, 100)}…请帮我分析一下`)}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground/50 transition-colors hover:text-foreground/70"
                      >
                        <MessageCircle size={9} />
                        提问
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
