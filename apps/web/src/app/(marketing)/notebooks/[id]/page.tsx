"use client";

import { ArrowLeft, FileText, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { m, useScroll, useTransform } from "framer-motion";

import { getPublicNotebook } from "@/services/public-service";
import type { PublicNotebookDetail, PublicNote } from "@/types";
import { formatDate } from "@/utils/format-date";
import { ReadOnlyNote } from "@/app/(marketing)/notebooks/[id]/read-only-note";
import { getNotebookIcon, pickDefaultIcon } from "@/features/notebook/notebook-icons";
import { publicHomeStyles } from "@/features/public-home/public-home-styles";

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
      if (docHeight > 0) setProgress(Math.min(1, scrollTop / docHeight));
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div style={{ position: "fixed", left: 0, right: 0, top: 0, zIndex: 50, height: 2, background: "rgba(200,148,60,0.12)" }}>
      <m.div
        style={{ height: "100%", width: `${progress * 100}%`, background: "linear-gradient(90deg, var(--gold), var(--gold-l))" }}
        transition={{ duration: 0.1 }}
      />
    </div>
  );
}

function TableOfContents({ items, activeId }: { items: TocItem[]; activeId: string }) {
  const t = useTranslations("marketing");
  if (items.length === 0) return null;

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <p className="lp-eyebrow" style={{ marginBottom: 12 }}>{t("toc")}</p>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          style={{
            display: "block",
            fontSize: item.level === 3 ? 11 : 12.5,
            lineHeight: 1.7,
            paddingLeft: item.level === 2 ? 12 : item.level === 3 ? 22 : 0,
            color: activeId === item.id ? "var(--gold)" : "rgba(237,231,218,0.38)",
            textDecoration: "none",
            transition: "color 0.15s",
            fontWeight: item.level === 1 ? 500 : 400,
            borderLeft: activeId === item.id ? "2px solid var(--gold)" : "2px solid transparent",
            paddingTop: 3,
            paddingBottom: 3,
          }}
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
      .then((nb) => { if (nb) setNotebook(nb); else setNotFound(true); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const tocItems = notebook ? extractTocFromNotes(notebook.notes) : [];

  const handleScroll = useCallback(() => {
    if (!contentRef.current || tocItems.length === 0) return;
    const headings = contentRef.current.querySelectorAll("[id]");
    let current = "";
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= 100) current = heading.id;
    }
    setActiveHeading(current);
  }, [tocItems.length]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const iconId = notebook ? (notebook.coverEmoji || pickDefaultIcon(notebook.id)) : "book";
  const NotebookIconComp = getNotebookIcon(iconId);

  const { scrollY } = useScroll();
  const navBg = useTransform(scrollY, [0, 80], ["rgba(7,11,20,0)", "rgba(7,11,20,0.88)"]);
  const navBlur = useTransform(scrollY, [0, 80], [0, 32]);
  const navBorderOpacity = useTransform(scrollY, [0, 80], [0, 0.12]);

  return (
    <>
      <style>{publicHomeStyles}</style>
      <main className="lp lp-grain" style={{ minHeight: "100vh" }}>
        <div className="lp-orb lp-orb-1" />
        <div className="lp-orb lp-orb-2" />
        <ReadingProgress />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Nav */}
          <m.nav
            className="lp-nav"
            style={{
              backgroundColor: navBg,
              backdropFilter: useTransform(navBlur, (v) => `blur(${v}px)`),
              WebkitBackdropFilter: useTransform(navBlur, (v) => `blur(${v}px)`),
              borderBottomColor: useTransform(navBorderOpacity, (v) => `rgba(200,148,60,${v})`),
            }}
          >
            <div className="lp-nav-inner">
              <Link href="/" className="lp-nav-brand" style={{ textDecoration: "none" }}>
                <Image src="/lyra.png" alt="LyraNote" width={22} height={22} style={{ borderRadius: 5, display: "block" }} />
                <span className="lp-display lp-nav-brand-name">LyraNote</span>
              </Link>
              <Link
                href="/"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 12.5, color: "rgba(237,231,218,0.4)",
                  textDecoration: "none", transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(237,231,218,0.4)")}
              >
                <ArrowLeft size={13} strokeWidth={2} />
                {t("backToGallery")}
              </Link>
            </div>
          </m.nav>

          <div className="lp-page-inner" style={{ paddingTop: 56, paddingBottom: 80 }}>
            {/* Loading */}
            {loading && (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 160 }}>
                <Loader2 size={22} style={{ color: "var(--gold)", animation: "lp-spin 1s linear infinite" }} />
              </div>
            )}

            {/* Not found */}
            {!loading && notFound && (
              <div style={{ paddingTop: 120, textAlign: "center" }}>
                <div style={{
                  margin: "0 auto 20px", width: 64, height: 64, borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)", background: "var(--surface)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <FileText size={26} style={{ color: "rgba(237,231,218,0.25)" }} />
                </div>
                <h2 style={{ fontSize: 16, color: "var(--text-2)", margin: 0 }}>{t("notFoundTitle")}</h2>
                <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, fontSize: 13, color: "var(--gold)", textDecoration: "none" }}>
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
                {/* Title */}
                <m.header variants={fadeUp} style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 40, paddingTop: 20, textAlign: "center" }}>
                  <div style={{
                    margin: "0 auto 20px", width: 60, height: 60, borderRadius: 14,
                    background: "rgba(200,148,60,0.08)", border: "1px solid rgba(200,148,60,0.18)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--gold)",
                  }}>
                    <NotebookIconComp size={28} />
                  </div>
                  <h1 className="lp-display" style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", letterSpacing: "-0.03em", lineHeight: 1.15, color: "var(--text)", margin: 0 }}>
                    {notebook.title}
                  </h1>
                  {notebook.description && (
                    <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.75, color: "var(--text-2)" }}>
                      {notebook.description}
                    </p>
                  )}
                  <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "4px 10px", fontSize: 11, letterSpacing: "0.12em", color: "var(--text-3)", textTransform: "uppercase" }}>
                    {notebook.publishedAt && <span>{formatDate(notebook.publishedAt)}</span>}
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{t("sourceCount", { count: notebook.sourceCount })}</span>
                    {notebook.wordCount > 0 && (
                      <>
                        <span style={{ opacity: 0.4 }}>·</span>
                        <span>
                          {notebook.wordCount >= 1000
                            ? t("wordCountK", { count: (notebook.wordCount / 1000).toFixed(1) })
                            : t("wordCount", { count: notebook.wordCount })}
                        </span>
                      </>
                    )}
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{t("noteCount", { count: notebook.notes.length })}</span>
                  </div>
                </m.header>

                {/* Summary */}
                {notebook.summary?.trim() && (
                  <m.div variants={fadeUp} style={{ margin: "0 0 48px" }}>
                    <div style={{
                      background: "#1a1d2e", borderRadius: 10, padding: "14px 18px",
                      border: "1px solid rgba(200,148,60,0.18)",
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57", display: "inline-block" }} />
                        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e", display: "inline-block" }} />
                        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c941", display: "inline-block" }} />
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                          <Sparkles size={10} style={{ color: "var(--gold)" }} />
                          <span style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(237,231,218,0.3)" }}>
                            AI · GEN
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ color: "#57c7ff", fontSize: "0.8rem", flexShrink: 0, lineHeight: 1.8 }}>~</span>
                        <span style={{ color: "#ff6ac1", fontSize: "0.8rem", flexShrink: 0, lineHeight: 1.8 }}>❯</span>
                        <p style={{ margin: 0, color: "rgba(251,235,226,0.82)", fontSize: "0.8rem", lineHeight: 1.8 }}>
                          {notebook.summary}
                        </p>
                      </div>
                    </div>
                  </m.div>
                )}

                {/* Content + TOC */}
                <div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
                  <div ref={contentRef} style={{ flex: 1, minWidth: 0 }}>
                    {notebook.notes.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 96 }}>
                        {notebook.notes.map((note) => (
                          <m.div key={note.id} variants={fadeUp} id={`note-${note.id}`} style={{ scrollMarginTop: 80 }}>
                            {note.title && (
                              <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                <h2 className="lp-display" style={{ fontSize: "1.55rem", letterSpacing: "-0.025em", lineHeight: 1.2, color: "var(--text)", margin: 0 }}>
                                  {note.title}
                                </h2>
                                <p style={{ marginTop: 6, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>
                                  {formatDate(note.updatedAt)}
                                  {note.wordCount > 0 && t("wordCountSuffix", { count: note.wordCount })}
                                </p>
                              </div>
                            )}
                            {(() => {
                              const doc = note.contentJson as { content?: unknown[] } | null
                              const hasJson = doc?.content && doc.content.length > 0
                              if (hasJson) return <div className="lp-prose"><ReadOnlyNote content={note.contentJson!} noteId={note.id} /></div>
                              if (note.contentText?.trim()) return (
                                <div className="lp-prose">
                                  <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.9, color: "var(--text-2)", margin: 0 }}>
                                    {note.contentText}
                                  </p>
                                </div>
                              )
                              return null
                            })()}
                          </m.div>
                        ))}
                      </div>
                    ) : (
                      <m.div variants={fadeUp} style={{ paddingTop: 64, textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>
                        {t("emptyNotebook")}
                      </m.div>
                    )}
                  </div>

                  {/* TOC sidebar */}
                  {tocItems.length > 0 && (
                    <aside style={{ width: 200, flexShrink: 0, display: "none" }} className="lp-toc-aside">
                      <div style={{ position: "sticky", top: 80 }}>
                        <TableOfContents items={tocItems} activeId={activeHeading} />
                      </div>
                    </aside>
                  )}
                </div>
              </m.article>
            )}

            {/* Footer */}
            <footer className="lp-footer" style={{ marginTop: 80 }}>
              <div className="lp-footer-rule" />
              <div className="lp-footer-brand">
                <Image src="/lyra.png" alt="LyraNote" width={18} height={18} style={{ borderRadius: 4, opacity: 0.55 }} />
                <span className="lp-display" style={{ fontSize: "1.05rem", letterSpacing: "-0.02em", color: "var(--text-3)" }}>LyraNote</span>
              </div>
              <p className="lp-footer-copy">{t("footer")}</p>
            </footer>
          </div>
        </div>
      </main>
    </>
  );
}
