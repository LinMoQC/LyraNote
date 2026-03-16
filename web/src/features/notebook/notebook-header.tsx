"use client";

import { ChevronLeft, Library, Share2, Zap } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function NotebookHeader({
  title,
  sourcesOpen,
  onToggleSources,
}: {
  title: string;
  sourcesOpen: boolean;
  onToggleSources: () => void;
}) {
  const t = useTranslations("notebook");
  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border/25 bg-card/30 px-5 backdrop-blur-sm">
      {/* Left: back + title + sources toggle */}
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/app/notebooks"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent/60 hover:text-foreground"
          title="返回笔记本列表"
        >
          <ChevronLeft size={16} />
        </Link>

        <div className="h-4 w-px flex-shrink-0 bg-border/40" />

        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight text-foreground/90">
            {title}
          </h1>
          <p className="mt-0.5 text-[11px] leading-none text-muted-foreground/35">{t("tab")}</p>
        </div>

        <div className="h-4 w-px flex-shrink-0 bg-border/40" />

        <button
          type="button"
          title="来源面板"
          onClick={onToggleSources}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
            sourcesOpen
              ? "bg-accent/80 text-foreground"
              : "text-muted-foreground/60 hover:bg-accent/60 hover:text-foreground"
          )}
        >
          <Library size={14} />
          <span>{t("tabSources")}</span>
        </button>
      </div>

      {/* Right: actions */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <Share2 size={13} />
          {t("share")}
        </button>

        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Zap size={13} />
          {t("generate")}
        </button>
      </div>
    </header>
  );
}
