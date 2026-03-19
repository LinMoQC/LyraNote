"use client";

import { AnimatePresence, m } from "framer-motion";
import { FlaskConical, Loader2, CheckCircle2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { notifySuccess } from "@/lib/notify";
import { useDeepResearchStore } from "@/store/use-deep-research-store";

export function DrFloatingIndicator() {
  const t = useTranslations("deepResearch");
  const router = useRouter();
  const pathname = usePathname();

  const { taskId, query, isActive, progress, reconnect, requestFocus, clear } = useDeepResearchStore();

  const reconnectedRef = useRef(false);
  const notifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!taskId || isActive || reconnectedRef.current) return;
    reconnectedRef.current = true;
    reconnect(taskId).catch(() => { clear(); });
  }, [taskId, isActive, reconnect, clear]);

  useEffect(() => {
    if (!taskId || isActive) return;
    if (progress?.status === "done" && notifiedRef.current !== taskId) {
      notifiedRef.current = taskId;
      notifySuccess(t("complete"));
    }
  }, [taskId, isActive, progress?.status, t]);

  useEffect(() => {
    if (!taskId) {
      reconnectedRef.current = false;
      notifiedRef.current = null;
    }
  }, [taskId]);

  const shouldShow = isActive || (taskId && progress?.status === "done");
  if (!shouldShow) return null;

  const isChatPage = pathname?.includes("/chat");
  const searchCount = progress?.learnings.length ?? 0;
  const totalQueries = progress?.subQuestions.length ?? 0;
  const isDone = progress?.status === "done" && !isActive;
  const pct = totalQueries > 0 ? Math.min(100, Math.round((searchCount / totalQueries) * 100)) : 0;

  const statusText = progress?.status === "planning"
    ? t("planningStep")
    : progress?.status === "searching"
      ? t("searchingStep")
      : progress?.status === "writing"
        ? t("writingStep")
        : t("inProgress");

  return (
    <AnimatePresence>
      <m.div
        key="dr-float"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={cn(
          "fixed bottom-5 right-5 z-50 w-64 cursor-pointer overflow-hidden rounded-xl border shadow-2xl backdrop-blur-2xl transition-colors",
          isDone
            ? "border-emerald-500/15 bg-card/95"
            : "border-border/30 bg-card/95",
        )}
        onClick={() => {
          if (isChatPage) {
            requestFocus();
          } else {
            router.push("/app/chat");
            requestFocus();
          }
        }}
        role="button"
        tabIndex={0}
      >
        {/* Progress bar at top edge */}
        {!isDone && (
          <div className="h-[2px] w-full bg-border/20">
            <m.div
              className="h-full bg-gradient-to-r from-amber-500/70 to-orange-400/70"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        )}

        <div className="flex items-center gap-3 px-3.5 py-3">
          {/* Icon */}
          <div className={cn(
            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
            isDone ? "bg-emerald-500/10" : "bg-amber-500/8",
          )}>
            {isDone ? (
              <CheckCircle2 size={16} className="text-emerald-400" />
            ) : (
              <FlaskConical size={15} className="text-amber-400" />
            )}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className={cn(
                "truncate text-[13px] font-medium leading-tight",
                isDone ? "text-emerald-400/90" : "text-foreground/85",
              )}>
                {isDone ? t("complete") : statusText}
              </p>
              {!isDone && (
                <Loader2 size={10} className="flex-shrink-0 animate-spin text-amber-400/50" />
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground/40">
              {isDone
                ? (query.slice(0, 28) + (query.length > 28 ? "…" : ""))
                : totalQueries > 0
                  ? `${searchCount} / ${totalQueries}`
                  : query.slice(0, 28) + (query.length > 28 ? "…" : "")}
            </p>
          </div>

          {/* Close / dismiss */}
          {isDone && (
            <button
              type="button"
              className="flex-shrink-0 rounded-md p-1 text-muted-foreground/30 transition-colors hover:bg-foreground/5 hover:text-muted-foreground/60"
              onClick={(e) => { e.stopPropagation(); clear(); }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </m.div>
    </AnimatePresence>
  );
}
