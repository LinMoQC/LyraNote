"use client";

import { m } from "framer-motion";
import Link from "next/link";
import { useTranslations } from "next-intl";

import type { Notebook } from "@/types";

const NOTEBOOK_STYLES = [
  { emoji: "📄", bg: "bg-amber-500/20" },
  { emoji: "📋", bg: "bg-teal-500/20" },
  { emoji: "🗺️", bg: "bg-indigo-500/20" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 26 }
  }
};

export function NotebookList({ notebooks }: { notebooks: Notebook[] }) {
  const t = useTranslations("home");
  return (
    <m.div
      className="flex flex-col"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {notebooks.slice(0, 3).map((notebook, i) => {
        const style = NOTEBOOK_STYLES[i % NOTEBOOK_STYLES.length]!;

        return (
          <m.div key={notebook.id} variants={itemVariants}>
            <Link
              href={`/app/notebooks/${notebook.id}`}
              className="group flex items-center gap-3.5 rounded-xl px-3 py-3 transition-colors hover:bg-muted/40"
            >
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-base ${style.bg}`}>
                {style.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {notebook.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/60">
                  {formatDate(notebook.updatedAt)} · {t("sources", { count: notebook.sourceCount })}
                </p>
              </div>
            </Link>
          </m.div>
        );
      })}
    </m.div>
  );
}
