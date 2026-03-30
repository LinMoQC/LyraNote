"use client";

/**
 * @file portrait-view.tsx
 * @description 自我画像页面入口：PortraitView（主容器）+ EmptyState + SynthesisProgress。
 *   动画基元 → portrait-primitives.tsx
 *   所有卡片  → portrait-cards.tsx
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { m, AnimatePresence } from "framer-motion";
import { RefreshCw, Sparkles, CheckCircle2, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Loader } from "@/components/ui/loader";

import { getMyPortrait, getPortraitHistory, triggerPortraitSynthesis } from "@/services/portrait-service";
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

const STAGE_KEYS = [
  "synthesisStageReading",
  "synthesisStageExtracting",
  "synthesisStageAnalyzing",
  "synthesisStageBuilding",
  "synthesisStageRefining",
] as const;

// Approximate seconds before each stage becomes active
const STAGE_THRESHOLDS = [0, 12, 24, 38, 52];
const POLL_INTERVAL_MS = 4000;
const TIMEOUT_MS = 5 * 60 * 1000;

/* ─── SynthesisProgress ──────────────────────────── */

function SynthesisProgress({
  compact = false,
  elapsed,
  stageIndex,
}: {
  compact?: boolean
  elapsed: number
  stageIndex: number
}) {
  const t = useTranslations("portrait");
  const stages = STAGE_KEYS.map((k) => t(k));

  // Progress: fill to ~88% over 64s, leave last 12% for real completion
  const rawProgress = Math.min((elapsed / 64000) * 88, 88);

  return (
    <m.div
      initial={{ opacity: 0, y: compact ? -6 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: compact ? -6 : 16 }}
      transition={{ duration: 0.35 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-violet-500/20",
        compact ? "p-3" : "p-6 md:p-8",
      )}
      style={{
        background:
          "linear-gradient(135deg, rgba(139,92,246,0.07) 0%, rgba(99,102,241,0.04) 60%, rgba(15,23,42,0.02) 100%)",
      }}
    >
      {/* Shimmer sweep */}
      <m.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.12) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
        }}
        animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
        transition={{ repeat: Infinity, duration: 2.8, ease: "linear" }}
      />

      {compact ? (
        /* ── Compact banner (shown when portrait already exists) ── */
        <div className="relative flex items-center gap-3">
          <m.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15"
          >
            <Sparkles className="h-3 w-3 text-violet-400" />
          </m.div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-foreground/70">
              {stages[stageIndex]}
              <AnimatedDots />
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-violet-500/10">
              <m.div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                initial={{ width: "0%" }}
                animate={{ width: `${rawProgress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/40">
            {t("synthesisElapsedSeconds", { seconds: Math.floor(elapsed / 1000) })}
          </span>
        </div>
      ) : (
        /* ── Full-page card (shown when no portrait yet) ── */
        <div className="relative flex flex-col items-center text-center">
          <m.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
            className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/12 ring-1 ring-violet-500/20"
          >
            <Sparkles className="h-6 w-6 text-violet-400/80" />
          </m.div>

          <p className="mb-1 text-[15px] font-semibold text-foreground/80">
            {t("synthesisInProgress")}
          </p>
          <p className="mb-6 text-[12px] text-muted-foreground/50">
            {stages[stageIndex]}
            <AnimatedDots />
          </p>

          {/* Progress bar */}
          <div className="mb-6 w-full max-w-xs">
            <div className="h-1.5 overflow-hidden rounded-full bg-violet-500/10">
              <m.div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-400 to-violet-500"
                initial={{ width: "0%" }}
                animate={{ width: `${rawProgress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{ backgroundSize: "200% 100%" }}
              />
            </div>
          </div>

          {/* Stage checklist */}
          <div className="w-full max-w-xs space-y-2 text-left">
            {stages.map((label, i) => {
              const isDone = i < stageIndex;
              const isActive = i === stageIndex;
              return (
                <m.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className={cn(
                    "flex items-center gap-2.5 text-[12px]",
                    isDone && "text-violet-400/60",
                    isActive && "text-foreground/80",
                    !isDone && !isActive && "text-muted-foreground/30",
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-violet-400/60" />
                  ) : isActive ? (
                    <m.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ repeat: Infinity, duration: 1.2 }}
                      className="h-3.5 w-3.5 shrink-0 rounded-full bg-violet-500/70"
                    />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 opacity-30" />
                  )}
                  {label}
                </m.div>
              );
            })}
          </div>

          <p className="mt-5 text-[11px] tabular-nums text-muted-foreground/35">
            {t("synthesisElapsedSeconds", { seconds: Math.floor(elapsed / 1000) })}
          </p>
        </div>
      )}
    </m.div>
  );
}

function AnimatedDots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <span className="inline-block w-5 text-left">{".".repeat(count)}</span>;
}

/* ─── PortraitView ───────────────────────────────── */

export function PortraitView() {
  const t = useTranslations("portrait");
  const { data: portrait, isLoading, refetch } = useQuery({
    queryKey: ["portrait"],
    queryFn: getMyPortrait,
  });

  const [triggering, setTriggering] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const synthesisStartRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      clearInterval(elapsedRef.current);
    };
  }, []);

  const stageIndex = (() => {
    let idx = 0;
    for (let i = 0; i < STAGE_THRESHOLDS.length; i++) {
      if (elapsed >= STAGE_THRESHOLDS[i] * 1000) idx = i;
    }
    return Math.min(idx, STAGE_KEYS.length - 1);
  })();

  const stopSynthesis = (success: boolean) => {
    clearInterval(pollRef.current);
    clearInterval(elapsedRef.current);
    setIsSynthesizing(false);
    setElapsed(0);
    if (success) {
      notifySuccess(t("synthesisComplete"));
      refetch();
    } else {
      notifyError(t("synthesisTimeout"));
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      // Capture baseline synthesized_at before triggering
      const history = await getPortraitHistory();
      const baselineAt = history[0]?.synthesized_at ?? null;

      await triggerPortraitSynthesis();

      synthesisStartRef.current = Date.now();
      setElapsed(0);
      setIsSynthesizing(true);

      // Elapsed ticker
      elapsedRef.current = setInterval(() => {
        setElapsed(Date.now() - synthesisStartRef.current);
      }, 500);

      // Poll for completion
      pollRef.current = setInterval(async () => {
        const age = Date.now() - synthesisStartRef.current;
        if (age > TIMEOUT_MS) {
          stopSynthesis(false);
          return;
        }
        try {
          const h = await getPortraitHistory();
          const newAt = h[0]?.synthesized_at ?? null;
          // Completed when timestamp changed or a portrait appeared for the first time
          if (newAt && newAt !== baselineAt) {
            stopSynthesis(true);
          }
        } catch {
          // ignore transient errors
        }
      }, POLL_INTERVAL_MS);
    } catch {
      notifyError(t("triggerFailed"));
      setIsSynthesizing(false);
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
            disabled={triggering || isSynthesizing}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-border/50 bg-muted/20 px-3.5 py-2 text-[12px] text-muted-foreground/70 transition-colors hover:border-violet-500/30 hover:bg-violet-500/8 hover:text-violet-300/80 disabled:opacity-40 md:rounded-lg"
          >
            <RefreshCw className={cn("h-3 w-3", (triggering || isSynthesizing) && "animate-spin")} />
            <span className="hidden sm:inline">{t("updatePortrait")}</span>
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-7">
        <AnimatePresence mode="wait">
          {!portrait ? (
            <m.div key="empty-or-synth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AnimatePresence mode="wait">
                {isSynthesizing ? (
                  <SynthesisProgress
                    key="synth-full"
                    elapsed={elapsed}
                    stageIndex={stageIndex}
                  />
                ) : (
                  <m.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <EmptyState onTrigger={handleTrigger} triggering={triggering} />
                  </m.div>
                )}
              </AnimatePresence>
            </m.div>
          ) : (
            <m.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4 md:space-y-5"
              data-testid="portrait-content"
            >
              {/* Compact progress banner when updating existing portrait */}
              <AnimatePresence>
                {isSynthesizing && (
                  <SynthesisProgress
                    key="synth-compact"
                    compact
                    elapsed={elapsed}
                    stageIndex={stageIndex}
                  />
                )}
              </AnimatePresence>

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
