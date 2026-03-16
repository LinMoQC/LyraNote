"use client";

import {
  ArrowRight,
  BookOpen,
  FileText,
  Loader2,
  MessageSquareText,
  Rss,
  Share2,
  Search,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { m, useInView } from "framer-motion";

import { getPublicNotebooks } from "@/services/public-service";
import type { PublicNotebook } from "@/types";
import { formatDate } from "@/utils/format-date";

const GRADIENT_STYLES: Record<string, React.CSSProperties> = {
  "from-amber-800/80 to-orange-700/80": { background: "linear-gradient(135deg,#92400e,#c2410c)" },
  "from-blue-800/80 to-indigo-700/80": { background: "linear-gradient(135deg,#1e40af,#4338ca)" },
  "from-emerald-800/80 to-teal-700/80": { background: "linear-gradient(135deg,#065f46,#0f766e)" },
  "from-violet-800/80 to-purple-700/80": { background: "linear-gradient(135deg,#5b21b6,#7c3aed)" },
  "from-rose-800/80 to-pink-700/80": { background: "linear-gradient(135deg,#9f1239,#be185d)" },
  "from-sky-800/80 to-cyan-700/80": { background: "linear-gradient(135deg,#075985,#0e7490)" },
  "from-slate-700/80 to-gray-600/80": { background: "linear-gradient(135deg,#334155,#4b5563)" },
  "from-fuchsia-800/80 to-pink-700/80": { background: "linear-gradient(135deg,#86198f,#9d174d)" },
};

const DEFAULT_GRADIENTS = Object.keys(GRADIENT_STYLES);
const DEFAULT_EMOJIS = ["📓", "📔", "📒", "📕", "📗", "📘", "📙", "🗒️", "📋", "📑"];

function pickDefault<T>(arr: T[], id: string): T {
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return arr[hash % arr.length];
}

function getGradientStyle(notebook: PublicNotebook): React.CSSProperties {
  if (notebook.coverGradient && GRADIENT_STYLES[notebook.coverGradient]) {
    return GRADIENT_STYLES[notebook.coverGradient];
  }
  return GRADIENT_STYLES[pickDefault(DEFAULT_GRADIENTS, notebook.id)];
}

function getEmoji(notebook: PublicNotebook): string {
  return notebook.coverEmoji || pickDefault(DEFAULT_EMOJIS, notebook.id);
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const FEATURES = [
  { icon: Search, titleKey: "featureRagTitle", descKey: "featureRagDesc" },
  { icon: MessageSquareText, titleKey: "featureAiTitle", descKey: "featureAiDesc" },
  { icon: Rss, titleKey: "featureTaskTitle", descKey: "featureTaskDesc" },
  { icon: Share2, titleKey: "featureShareTitle", descKey: "featureShareDesc" },
] as const;

function NotebookCard({ notebook }: { notebook: PublicNotebook }) {
  const t = useTranslations("marketing");

  return (
    <m.div variants={fadeUp}>
      <Link href={`/notebooks/${notebook.id}`} className="block h-full">
        <article className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-300 hover:border-border hover:shadow-lg hover:-translate-y-0.5">
          <div
            className="flex items-end px-5 pb-0 h-24"
            style={getGradientStyle(notebook)}
          >
            <div className="flex -mb-5 items-center justify-center rounded-xl bg-background shadow-md ring-2 ring-background h-11 w-11 text-xl">
              {getEmoji(notebook)}
            </div>
          </div>

          <div className="flex flex-1 flex-col px-5 pb-5 pt-8">
            <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
              {notebook.title}
            </h3>

            {notebook.summary ? (
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {notebook.summary}
              </p>
            ) : notebook.description ? (
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground/70">
                {notebook.description}
              </p>
            ) : null}

            <div className="mt-auto flex items-center gap-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground/70">
              {notebook.publishedAt && (
                <>
                  <span>{formatDate(notebook.publishedAt)}</span>
                  <span className="opacity-40">·</span>
                </>
              )}
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
            </div>
          </div>
        </article>
      </Link>
    </m.div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <m.div
      variants={fadeUp}
      className="group relative rounded-2xl border border-border/60 bg-card p-6 transition-all duration-300 hover:border-primary/20 hover:shadow-lg"
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
        <Icon size={20} />
      </div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
    </m.div>
  );
}

export default function GalleryPage() {
  const t = useTranslations("marketing");
  const [notebooks, setNotebooks] = useState<PublicNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const galleryRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const featuresInView = useInView(featuresRef, { once: true, margin: "-60px" });

  useEffect(() => {
    getPublicNotebooks()
      .then(setNotebooks)
      .catch(() => setNotebooks([]))
      .finally(() => setLoading(false));
  }, []);

  const scrollToGallery = () => {
    galleryRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-64 w-64 rounded-full bg-primary/[0.04] blur-[80px]" />
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--primary) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.4) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Navbar */}
        <nav className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/lyra.png" alt="LyraNote" width={24} height={24} className="h-6 w-6 rounded-md" />
            <span className="text-sm font-semibold text-foreground">LyraNote</span>
          </div>
          <Link
            href="/app"
            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3.5 py-1.5 text-sm text-foreground/80 transition-all hover:border-border hover:bg-accent hover:text-foreground"
          >
            {t("enterWorkspace")}
            <ArrowRight size={13} />
          </Link>
        </nav>

        {/* Hero section */}
        <m.section
          className="pb-16 pt-20 text-center md:pt-28 md:pb-24"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
        >
          <m.div
            variants={fadeUp}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] px-4 py-1.5 text-xs font-medium text-primary"
          >
            <BookOpen size={12} />
            LyraNote
          </m.div>

          <m.h1
            variants={fadeUp}
            className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl"
          >
            {t("heroTitle")}
          </m.h1>

          <m.p
            variants={fadeUp}
            className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg"
          >
            {t("heroSubtitle")}
          </m.p>

          <m.div variants={fadeUp} className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90"
            >
              {t("startNow")}
              <ArrowRight size={14} />
            </Link>
            <button
              onClick={scrollToGallery}
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-6 py-2.5 text-sm font-medium text-foreground/80 transition-all hover:border-border hover:bg-accent hover:text-foreground"
            >
              {t("exploreNotebooks")}
            </button>
          </m.div>
        </m.section>

        {/* Feature highlights */}
        <m.section
          ref={featuresRef}
          className="mb-20"
          initial="hidden"
          animate={featuresInView ? "visible" : "hidden"}
          variants={stagger}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <FeatureCard
                key={f.titleKey}
                icon={f.icon}
                title={t(f.titleKey)}
                description={t(f.descKey)}
              />
            ))}
          </div>
        </m.section>

        {/* Notebook gallery */}
        <div ref={galleryRef} className="scroll-mt-8">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-32">
              <Loader2 size={24} className="animate-spin text-muted-foreground/40" />
            </div>
          )}

          {/* Empty state */}
          {!loading && notebooks.length === 0 && (
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-md py-24 text-center"
            >
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-card">
                <FileText size={28} className="text-muted-foreground/40" />
              </div>
              <h2 className="text-lg font-semibold text-foreground/80">{t("empty")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("emptyDesc")}</p>
              <Link
                href="/app"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90"
              >
                {t("enterWorkspace")}
                <ArrowRight size={14} />
              </Link>
            </m.div>
          )}

          {/* Notebooks */}
          {!loading && notebooks.length > 0 && (
            <m.section
              className="mb-16"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={stagger}
            >
              <m.div variants={fadeUp} className="mb-6 flex items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
                <span className="text-xs text-muted-foreground/60">
                  {notebooks.length} notebooks
                </span>
              </m.div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {notebooks.map((nb) => (
                  <NotebookCard key={nb.id} notebook={nb} />
                ))}
              </div>
            </m.section>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground/60">
          {t("footer")}
        </footer>
      </div>
    </main>
  );
}
