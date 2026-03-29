"use client";

/**
 * @file portrait-view.tsx
 * @description 自我画像页面入口：PortraitView（主容器）+ EmptyState。
 *   动画基元 → portrait-primitives.tsx
 *   所有卡片  → portrait-cards.tsx
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { m, AnimatePresence } from "framer-motion";
import { RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Loader } from "@/components/ui/loader";

import { getMyPortrait, triggerPortraitSynthesis } from "@/services/portrait-service";
import { cn } from "@/lib/utils";
import { notifySuccess, notifyError } from "@/lib/notify";
import {
  IdentityHeroCard,
  KnowledgeMapCard,
  ThoughtStream,
  InteractionStyleCard,
  GrowthVelocityCard,
  GrowthSignalsCard,
  LyraNotesCard,
} from "./portrait-cards";

/* ─── PortraitView ───────────────────────────────── */

export function PortraitView() {
  const t = useTranslations("portrait");
  const { data: portrait, isLoading, refetch } = useQuery({
    queryKey: ["portrait"],
    queryFn: getMyPortrait,
  });

  const [triggering, setTriggering] = useState(false);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerPortraitSynthesis();
      notifySuccess(t("synthesizing"));
      setTimeout(() => refetch(), 5000);
    } catch {
      notifyError(t("triggerFailed"));
    } finally {
      setTriggering(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 border border-border/40 dark:border">
        <Loader color="#7c3aed" />
        <p className="text-sm text-muted-foreground/50">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto border border-border/40 dark:border">
      {/* ── Header ─────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-foreground/[0.05] bg-background/80 px-4 py-4 backdrop-blur-md md:px-8 md:py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <m.div
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20 md:h-9 md:w-9"
              animate={{ boxShadow: ["0 0 0px rgba(139,92,246,0)", "0 0 16px rgba(139,92,246,0.25)", "0 0 0px rgba(139,92,246,0)"] }}
              transition={{ repeat: Infinity, duration: 3.5 }}
            >
              <Sparkles className="h-4 w-4 text-violet-400" />
            </m.div>
            <div>
              <h1 className="text-[18px] font-semibold text-foreground/90 md:text-[17px]">{t("title")}</h1>
              <p className="text-[12px] text-muted-foreground/45">
                {portrait ? t("viewOfYou") : t("dataAccumulating")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTrigger}
            disabled={triggering}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-border/50 bg-muted/20 px-3.5 py-2 text-[12px] text-muted-foreground/70 transition-colors hover:border-violet-500/30 hover:bg-violet-500/8 hover:text-violet-300/80 disabled:opacity-40 md:rounded-lg"
          >
            <RefreshCw className={cn("h-3 w-3", triggering && "animate-spin")} />
            <span className="hidden sm:inline">{t("updatePortrait")}</span>
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-7">
        <AnimatePresence mode="wait">
          {!portrait ? (
            <m.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <EmptyState onTrigger={handleTrigger} triggering={triggering} />
            </m.div>
          ) : (
            <m.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4 md:space-y-5"
              data-testid="portrait-content"
            >
              <IdentityHeroCard portrait={portrait} />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-5 md:gap-5">
                <div className="md:col-span-3"><KnowledgeMapCard portrait={portrait} /></div>
                <div className="md:col-span-2"><InteractionStyleCard portrait={portrait} /></div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-5 md:gap-5">
                <div className="md:col-span-3"><ThoughtStream portrait={portrait} /></div>
                <div className="md:col-span-2"><GrowthVelocityCard portrait={portrait} /></div>
              </div>

              <GrowthSignalsCard portrait={portrait} />

              {portrait.lyra_service_notes && (
                <LyraNotesCard notes={portrait.lyra_service_notes} />
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── EmptyState ─────────────────────────────────── */

function EmptyState({ onTrigger, triggering }: { onTrigger: () => void; triggering: boolean }) {
  const t = useTranslations("portrait");
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/30 py-28 text-center"
    >
      <m.div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ repeat: Infinity, duration: 3.5 }}
      >
        <Sparkles className="h-6 w-6 text-violet-400/60" />
      </m.div>
      <p className="mb-1 text-sm font-medium text-foreground/50">{t("notGenerated")}</p>
      <p className="mb-6 max-w-xs text-[12px] text-muted-foreground/40">
        {t("notGeneratedDesc")}
      </p>
      <button
        type="button"
        onClick={onTrigger}
        disabled={triggering}
        className="flex items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/10 px-4 py-2 text-[12px] text-violet-400/80 transition-colors hover:bg-violet-500/20 disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3 w-3", triggering && "animate-spin")} />
        {t("synthesizeNow")}
      </button>
    </m.div>
  );
}
