"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Save,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";
import { buildMarkdownComponents } from "@/components/genui";
import { EVIDENCE_STRENGTH_CONFIG, type DrProgress } from "./dr-types";

// ── Evidence badge helpers ─────────────────────────────────────────────────────

function EvidenceBadge({ grade }: { grade: "强" | "中" | "弱" }) {
  const t = useTranslations("deepResearch");
  const configs = {
    强: { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", labelKey: "evGradeStrong" as const },
    中: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/25", labelKey: "evGradeMedium" as const },
    弱: { cls: "bg-red-500/15 text-red-400 border-red-500/25", labelKey: "evGradeWeak" as const },
  } as const;
  const cfg = configs[grade];
  return (
    <span className={cn("mx-1 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium", cfg.cls)}>
      {t("evBadgePrefix")}{t(cfg.labelKey)}
    </span>
  );
}

/** Replace [证据：强/中/弱] with inline-code tokens so remark never sees the brackets. */
function injectEvidenceTokens(md: string): string {
  return md
    .replace(/\[证据：强\]/g, "`__ev:strong__`")
    .replace(/\[证据：中\]/g, "`__ev:medium__`")
    .replace(/\[证据：弱\]/g, "`__ev:weak__`");
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = markdown.split("\n");
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
      const id = `heading-${items.length}`;
      items.push({ id, text, level });
    }
  }
  return items;
}

function headingId(index: { current: number }) {
  const id = `heading-${index.current}`;
  index.current += 1;
  return id;
}

export function DrDocumentViewer({
  open,
  progress,
  onClose,
  onSaveNote,
  onSaveSources,
  onFollowUp,
  onRate,
  onCopy,
  savedMessageId: _savedMessageId,
}: {
  open: boolean;
  progress: DrProgress;
  onClose: () => void;
  onSaveNote?: (report?: string, title?: string) => void;
  onSaveSources?: () => void;
  onFollowUp?: (q: string) => void;
  onRate?: (rating: "like" | "dislike") => void;
  onCopy?: (text: string) => void;
  savedMessageId?: string | null;
}) {
  const t = useTranslations("deepResearch");
  const tc = useTranslations("common");
  const [rated, setRated] = useState<"like" | "dislike" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [citationOpen, setCitationOpen] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string>("");
  const [tocVisible, setTocVisible] = useState(false);
  const tocTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const { deliverable, reportTokens, doneCitations } = progress;
  const title = deliverable?.title ?? t("reportTitle");
  const toc = useMemo(() => extractToc(reportTokens), [reportTokens]);

  // Track active heading on scroll
  useEffect(() => {
    if (!open || !bodyRef.current || toc.length === 0) return;
    const container = bodyRef.current;
    const handleScroll = () => {
      const headings = container.querySelectorAll("[data-toc-id]");
      let current = "";
      for (const heading of headings) {
        const rect = heading.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top - containerRect.top <= 80) {
          current = heading.getAttribute("data-toc-id") ?? "";
        }
      }
      setActiveHeading(current);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [open, toc]);

  const scrollToHeading = useCallback((id: string) => {
    if (!bodyRef.current) return;
    const el = bodyRef.current.querySelector(`[data-toc-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const showToc = useCallback(() => {
    if (tocTimerRef.current) clearTimeout(tocTimerRef.current);
    setTocVisible(true);
  }, []);

  const hideToc = useCallback(() => {
    tocTimerRef.current = setTimeout(() => setTocVisible(false), 300);
  }, []);

  if (!open) return null;

  const strengthCfg = deliverable
    ? EVIDENCE_STRENGTH_CONFIG[deliverable.evidenceStrength]
    : null;

  async function handleSave() {
    if (saving || saved || !onSaveNote) return;
    setSaving(true);
    try {
      await onSaveNote(reportTokens, title);
      setSaved(true);
    } catch {
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  function handleRate(rating: "like" | "dislike") {
    if (rated) return;
    setRated(rating);
    onRate?.(rating);
  }

  const headingCounter = { current: 0 };

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-border/40 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15">
                  <FileText size={18} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
                  <div className="mt-0.5 flex items-center gap-2">
                    {deliverable && (
                      <span className="text-[11px] text-muted-foreground/50">
                        {t("sourceCount", { count: deliverable.citationCount })}
                      </span>
                    )}
                    {strengthCfg && deliverable && (
                      <span
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
                          strengthCfg.color,
                        )}
                      >
                        <strengthCfg.icon size={9} />
                        {t(strengthCfg.labelKey)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {onCopy && (
                  <button
                    type="button"
                    onClick={() => onCopy(reportTokens)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground/70"
                    title={t("copyReport")}
                  >
                    <Copy size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || saved || !onSaveNote}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    saved
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-muted/40 text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground/70",
                  )}
                >
                  <Save size={12} />
                  {saving ? tc("saving") : saved ? t("savedAsNote") : t("saveAsNote")}
                </button>
                {onSaveSources && (
                  <button
                    type="button"
                    onClick={onSaveSources}
                    className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground/60 transition-all hover:bg-muted/60 hover:text-foreground/70"
                  >
                    <Globe size={12} />
                    {t("saveSources")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground/70"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              {/* Main content - scrollable, narrow centered column */}
              <div ref={bodyRef} className="flex-1 overflow-y-auto py-6">
                <div className="mx-auto max-w-2xl px-6">
                {/* Summary */}
                {deliverable?.summary && (
                  <div className="mb-6 rounded-xl border border-border/30 bg-muted/20 px-5 py-4">
                    <p className="text-sm leading-relaxed text-foreground/75">{deliverable.summary}</p>
                  </div>
                )}

                {/* Full report */}
                <div className="prose prose-sm prose-invert max-w-none text-[14px] leading-[1.8] text-foreground/85 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-foreground/60 [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-foreground [&_h2]:mb-2.5 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:my-1 [&_ol]:my-2 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-2.5 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:my-2 [&_ul]:ml-5 [&_ul]:list-disc">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      ...buildMarkdownComponents({}),
                      h1: ({ children }) => {
                        const id = headingId(headingCounter);
                        return <h1 data-toc-id={id}>{children}</h1>;
                      },
                      h2: ({ children }) => {
                        const id = headingId(headingCounter);
                        return <h2 data-toc-id={id}>{children}</h2>;
                      },
                      h3: ({ children }) => {
                        const id = headingId(headingCounter);
                        return <h3 data-toc-id={id}>{children}</h3>;
                      },
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      code: (codeProps: any): React.ReactNode => {
                        const { children, className, ...rest } = codeProps;
                        const text = String(children).replace(/\n$/, "");
                        if (text === "__ev:strong__") return <EvidenceBadge grade="强" />;
                        if (text === "__ev:medium__") return <EvidenceBadge grade="中" />;
                        if (text === "__ev:weak__")   return <EvidenceBadge grade="弱" />;
                        const baseMd = buildMarkdownComponents({});
                        return (baseMd.code as (...args: unknown[]) => React.ReactNode)({ children, className, ...rest });
                      },
                    }}
                  >
                    {injectEvidenceTokens(reportTokens)}
                  </ReactMarkdown>
                </div>

                {/* Citations section — hidden when citation table already provides a summary */}
                {doneCitations.length > 0 && !(deliverable && deliverable.citationTable.length > 0) && (
                  <div className="mt-8 border-t border-border/30 pt-4">
                    <button
                      type="button"
                      onClick={() => setCitationOpen((v) => !v)}
                      className="flex items-center gap-2 text-xs font-medium text-muted-foreground/50 transition-colors hover:text-muted-foreground/80"
                    >
                      {citationOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {t("allSources")} ({doneCitations.length})
                    </button>
                    <AnimatePresence>
                      {citationOpen && (
                        <m.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 space-y-1.5">
                            {doneCitations.map((c, i) => (
                              <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/30">
                                {c.type === "web" ? (
                                  <Globe size={11} className="flex-shrink-0 text-cyan-400/60" />
                                ) : (
                                  <FileText size={11} className="flex-shrink-0 text-blue-400/60" />
                                )}
                                {c.url ? (
                                  <a
                                    href={c.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 truncate text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground/90"
                                  >
                                    <span className="truncate">{c.title || c.url}</span>
                                    <ExternalLink size={10} className="flex-shrink-0 opacity-50" />
                                  </a>
                                ) : (
                                  <span className="truncate text-xs text-muted-foreground/60">{c.title || tc("internalSource")}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Citation table */}
                {deliverable && deliverable.citationTable.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground/50">
                      {t("citationTable", { count: deliverable.citationTable.length })}
                    </p>
                    <div className="space-y-1.5">
                      {deliverable.citationTable.map((row, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-lg border border-border/20 bg-muted/20 px-3 py-2">
                          <span
                            className={cn(
                              "mt-1 h-2 w-2 flex-shrink-0 rounded-full",
                              row.grade === "strong" ? "bg-emerald-400" : row.grade === "medium" ? "bg-amber-400" : "bg-red-400",
                            )}
                          />
                          <span className="flex-1 text-xs text-foreground/75">{row.conclusion}</span>
                          <span className="flex-shrink-0 text-[10px] text-muted-foreground/40">{row.source}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              </div>

              {/* Floating TOC - skeleton lines by default, real TOC on hover */}
              {toc.length > 2 && (
                <div
                  className="absolute right-0 top-0 hidden h-full w-20 lg:flex lg:items-center lg:justify-center"
                  onMouseEnter={showToc}
                  onMouseLeave={hideToc}
                >
                  {/* Skeleton lines */}
                  <m.div
                    animate={{ opacity: tocVisible ? 0 : 0.8 }}
                    transition={{ duration: 0.15 }}
                    className="flex cursor-pointer flex-col gap-3"
                  >
                    {toc.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "h-[3px] rounded-full transition-colors",
                          activeHeading === item.id
                            ? "bg-primary/80"
                            : "bg-muted-foreground/25",
                          item.level === 1 && "w-10",
                          item.level === 2 && "ml-1.5 w-7",
                          item.level === 3 && "ml-3 w-5",
                        )}
                      />
                    ))}
                  </m.div>

                  {/* Real TOC panel - appears at same position on hover */}
                  <AnimatePresence>
                    {tocVisible && (
                      <m.div
                        key="toc-full"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute right-2 w-52 rounded-xl border border-border/40 bg-card/95 shadow-xl shadow-black/20 backdrop-blur-md"
                        onMouseEnter={showToc}
                        onMouseLeave={hideToc}
                      >
                        <div className="max-h-[60vh] overflow-y-auto px-3 py-3">
                          <div className="mb-2.5 truncate text-[11px] font-semibold text-primary/80">
                            {title}
                          </div>
                          <nav className="space-y-0.5">
                            {toc.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => scrollToHeading(item.id)}
                                className={cn(
                                  "block w-full truncate rounded-md px-2 py-1.5 text-left text-[12px] leading-snug transition-colors",
                                  item.level === 1 && "font-medium",
                                  item.level === 2 && "pl-4",
                                  item.level === 3 && "pl-6 text-[11px]",
                                  activeHeading === item.id
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
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-shrink-0 items-center justify-between border-t border-border/40 px-6 py-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRate("like")}
                  disabled={!!rated}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-all",
                    rated === "like"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "text-muted-foreground/40 hover:bg-muted/40 hover:text-muted-foreground/70",
                  )}
                  title={t("helpful")}
                >
                  <ThumbsUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRate("dislike")}
                  disabled={!!rated}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-all",
                    rated === "dislike"
                      ? "bg-red-500/20 text-red-400"
                      : "text-muted-foreground/40 hover:bg-muted/40 hover:text-muted-foreground/70",
                  )}
                  title={t("notAccurate")}
                >
                  <ThumbsDown size={13} />
                </button>
              </div>

              {deliverable && deliverable.nextQuestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground/40">{t("followUp")}:</span>
                  {deliverable.nextQuestions.slice(0, 3).map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        onClose();
                        onFollowUp?.(q);
                      }}
                      className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[10px] text-primary/70 transition-all hover:border-primary/40 hover:bg-primary/15 hover:text-primary/90 active:scale-95"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
