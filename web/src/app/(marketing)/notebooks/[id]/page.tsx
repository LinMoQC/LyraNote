"use client";

import { ArrowLeft, FileText, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { m } from "framer-motion";

import { getPublicNotebook } from "@/services/public-service";
import type { PublicNotebookDetail, PublicNote } from "@/types";
import { formatDate } from "@/utils/format-date";
import { ReadOnlyNote } from "@/app/(marketing)/notebooks/[id]/read-only-note";

import {
  getNotebookIcon,
  pickDefaultIcon,
} from "@/features/notebook/notebook-icons";

type TocItem = { id: string; title: string; level: number };

function extractTocFromNotes(notes: PublicNote[]): TocItem[] {
  const items: TocItem[] = [];
  for (const note of notes) {
    if (note.title) {
      items.push({ id: `note-${note.id}`, title: note.title, level: 1 });
    }
    if (note.contentJson) {
      const doc = note.contentJson as { content?: Array<{ type?: string; attrs?: { level?: number }; content?: Array<{ text?: string }> }> };
      if (doc.content) {
        for (const node of doc.content) {
          if (node.type === "heading" && node.content) {
            const text = node.content.map((c) => c.text || "").join("");
            if (text.trim()) {
              const level = node.attrs?.level ?? 2;
              const id = `heading-${note.id}-${text.slice(0, 20).replace(/\s+/g, "-")}`;
              items.push({ id, title: text, level: Math.min(level, 3) });
            }
          }
        }
      }
    }
  }
  return items;
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        setProgress(Math.min(1, scrollTop / docHeight));
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="fixed left-0 right-0 top-0 z-50 h-0.5 bg-border/30">
      <m.div
        className="h-full bg-primary"
        style={{ width: `${progress * 100}%` }}
        transition={{ duration: 0.1 }}
      />
    </div>
  );
}

function TableOfContents({ items, activeId }: { items: TocItem[]; activeId: string }) {
  const t = useTranslations("marketing");

  if (items.length === 0) return null;

  return (
    <nav className="space-y-1">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        {t("toc")}
      </p>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`block text-[13px] leading-relaxed transition-colors duration-150 ${
            item.level === 1
              ? "font-medium"
              : item.level === 2
                ? "pl-3"
                : "pl-6 text-[12px]"
          } ${
            activeId === item.id
              ? "text-primary"
              : "text-muted-foreground/70 hover:text-foreground"
          }`}
        >
          {item.title}
        </a>
      ))}
    </nav>
  );
}

export default function PublicNotebookPage() {
  const params = useParams();
  const id = params.id as string;
  const t = useTranslations("marketing");

  const [notebook, setNotebook] = useState<PublicNotebookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeHeading, setActiveHeading] = useState("");

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    getPublicNotebook(id)
      .then((nb) => {
        if (nb) setNotebook(nb);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const tocItems = notebook ? extractTocFromNotes(notebook.notes) : [];

  const handleScroll = useCallback(() => {
    if (!contentRef.current || tocItems.length === 0) return;
    const headings = contentRef.current.querySelectorAll("[id]");
    let current = "";
    for (const heading of headings) {
      const rect = heading.getBoundingClientRect();
      if (rect.top <= 100) {
        current = heading.id;
      }
    }
    setActiveHeading(current);
  }, [tocItems.length]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const iconId = notebook ? (notebook.coverEmoji || pickDefaultIcon(notebook.id)) : "book";
  const NotebookIconComp = getNotebookIcon(iconId);

  return (
    <main className="relative min-h-screen bg-background">
      <ReadingProgress />

      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Navbar */}
        <nav className="flex h-14 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={14} />
            {t("backToGallery")}
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <Image src="/lyra.png" alt="LyraNote" width={20} height={20} className="h-5 w-5 rounded-md" />
            <span className="text-sm font-semibold text-foreground/80">LyraNote</span>
          </Link>
        </nav>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-40">
            <Loader2 size={24} className="animate-spin text-muted-foreground/40" />
          </div>
        )}

        {/* Not found */}
        {!loading && notFound && (
          <div className="py-32 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-card">
              <FileText size={28} className="text-muted-foreground/40" />
            </div>
            <h2 className="text-lg font-semibold text-foreground/80">笔记本不存在或未公开</h2>
            <Link
              href="/"
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:opacity-80"
            >
              <ArrowLeft size={13} />
              {t("backToGallery")}
            </Link>
          </div>
        )}

        {/* Notebook content */}
        {!loading && notebook && (
          <m.article
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          >
            {/* Title area */}
            <m.header variants={fadeUp} className="mx-auto max-w-3xl pb-8 pt-12 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                <NotebookIconComp size={36} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {notebook.title}
              </h1>
              {notebook.description && (
                <p className="mt-3 text-sm text-muted-foreground">{notebook.description}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground/70">
                {notebook.publishedAt && (
                  <span>{t("publishedAt", { date: formatDate(notebook.publishedAt) })}</span>
                )}
                <span className="opacity-40">·</span>
                <span>{t("sourceCount", { count: notebook.sourceCount })}</span>
                {notebook.wordCount > 0 && (
                  <>
                    <span className="opacity-40">·</span>
                    <span>
                      {notebook.wordCount >= 1000
                        ? t("wordCountK", { count: (notebook.wordCount / 1000).toFixed(1) })
                        : t("wordCount", { count: notebook.wordCount })}
                    </span>
                  </>
                )}
                <span className="opacity-40">·</span>
                <span>{t("noteCount", { count: notebook.notes.length })}</span>
              </div>
            </m.header>

            {/* Summary — skewed accent block */}
            {notebook.summary && (
              <m.div
                variants={fadeUp}
                className="relative my-8 -mx-4 lg:-mx-8 overflow-hidden [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]"
              >
                <div className="relative -skew-x-2 transform bg-gradient-to-b from-primary/10 via-primary/5 to-transparent px-8 py-6 pb-10 transition-all duration-300">
                  <div className="skew-x-2 transform">
                    <div className="absolute right-8 top-3 flex items-center gap-2 text-xs text-muted-foreground/40">
                      <span className="size-2 animate-pulse rounded-full bg-primary/60" />
                      <span className="font-mono">AI·GEN</span>
                    </div>
                    <div className="max-w-4xl pt-3">
                      <h3 className="mb-3 flex items-center gap-2 text-base font-medium leading-tight text-primary">
                        <Sparkles size={18} />
                        {t("summary")}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground/80">
                        {notebook.summary}
                      </p>
                    </div>
                  </div>
                </div>
              </m.div>
            )}

            {/* Content + TOC layout */}
            <div className="relative flex gap-10">
              {/* Main content */}
              <div ref={contentRef} className="min-w-0 flex-1">
                {notebook.notes.length > 0 ? (
                  <div className="space-y-12">
                    {notebook.notes.map((note) => (
                      <m.div
                        key={note.id}
                        variants={fadeUp}
                        id={`note-${note.id}`}
                        className="scroll-mt-16"
                      >
                        {note.title && (
                          <div className="mb-4">
                            <h2 className="text-xl font-bold text-foreground">{note.title}</h2>
                            <p className="mt-1 text-xs text-muted-foreground/50">
                              {formatDate(note.updatedAt)}
                              {note.wordCount > 0 && ` · ${note.wordCount} 字`}
                            </p>
                          </div>
                        )}
                        <div>
                          {note.contentJson ? (
                            <ReadOnlyNote content={note.contentJson} noteId={note.id} />
                          ) : note.contentText ? (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                              {note.contentText}
                            </p>
                          ) : (
                            <p className="text-sm italic text-muted-foreground/40">空笔记</p>
                          )}
                        </div>
                      </m.div>
                    ))}
                  </div>
                ) : (
                  <m.div variants={fadeUp} className="py-16 text-center text-sm text-muted-foreground/50">
                    此笔记本暂无笔记内容
                  </m.div>
                )}
              </div>

              {/* TOC sidebar */}
              {tocItems.length > 0 && (
                <aside className="hidden w-56 shrink-0 lg:block">
                  <div className="sticky top-16">
                    <TableOfContents items={tocItems} activeId={activeHeading} />
                  </div>
                </aside>
              )}
            </div>
          </m.article>
        )}

        {/* Footer */}
        <footer className="mt-16 border-t border-border/60 py-8 text-center text-xs text-muted-foreground/50">
          {t("footer")}
        </footer>
      </div>
    </main>
  );
}
