"use client";

import { m } from "framer-motion";
import {
  Copy,
  ExternalLink,
  FileText,
  Globe,
  MoreHorizontal,
  Save,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { DrProgress } from "./dr-types";

export function DrDocumentCard({
  progress,
  onOpen,
  onSaveNote,
  onSaveSources,
  onCopy,
}: {
  progress: DrProgress;
  onOpen: () => void;
  onSaveNote?: (report?: string, title?: string) => void;
  onSaveSources?: () => void;
  onCopy?: (text: string) => void;
}) {
  const t = useTranslations("deepResearch");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const title = progress.deliverable?.title ?? t("reportTitle");

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group w-full max-w-lg cursor-pointer overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm transition-all hover:border-border/80 hover:shadow-md"
      onClick={onOpen}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 border-b border-border/30 px-5 py-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
          <FileText size={16} className="text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-foreground/90">{title}</h4>
          {progress.deliverable && (
            <p className="text-[10px] text-muted-foreground/50">
              {t("sourceCount", { count: progress.deliverable.citationCount })}
            </p>
          )}
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-muted/50 hover:text-muted-foreground/70 group-hover:opacity-100"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div className="absolute right-0 top-8 z-50 min-w-36 rounded-lg border border-border/60 bg-card p-1 shadow-xl">
                {onSaveNote && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onSaveNote(progress.reportTokens, progress.deliverable?.title);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs text-foreground/80 transition-colors hover:bg-muted/50"
                  >
                    <Save size={12} />
                    {t("saveAsNote")}
                  </button>
                )}
                {onCopy && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onCopy(progress.reportTokens);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-foreground/80 transition-colors hover:bg-muted/50"
                  >
                    <Copy size={12} />
                    {t("copyReport")}
                  </button>
                )}
                {onSaveSources && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onSaveSources();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-foreground/80 transition-colors hover:bg-muted/50"
                  >
                    <Globe size={12} />
                    {t("saveSources")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onOpen();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-foreground/80 transition-colors hover:bg-muted/50"
                >
                  <ExternalLink size={12} />
                  {t("viewFullReport")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Formatted content preview with gradient fade */}
      <div className="relative max-h-64 overflow-hidden px-5 py-4">
        <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-[1.75] text-foreground/80 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:text-foreground/50 [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-foreground [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mb-1 [&_h3]:mt-2.5 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground/90 [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {progress.reportTokens}
          </ReactMarkdown>
        </div>
        {/* Gradient fade overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card via-card/80 to-transparent" />
      </div>
    </m.div>
  );
}
