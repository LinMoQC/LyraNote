"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Loader2, X } from "lucide-react";
import { AnimatePresence, m } from "framer-motion";
import { useTranslations } from "next-intl";
import { getTaskRuns, type TaskRun } from "@/services/task-service";

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function RunItem({ run }: { run: TaskRun }) {
  const t = useTranslations("tasks");
  const isSuccess = run.status === "success";
  const isFailed = run.status === "failed";

  return (
    <div className="rounded-lg border border-border/30 bg-card/50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {isSuccess && <CheckCircle2 size={13} className="text-emerald-400" />}
        {isFailed && <AlertCircle size={13} className="text-red-400" />}
        {run.status === "running" && <Loader2 size={13} className="animate-spin text-blue-400" />}

        <span className="text-[12px] text-foreground/80">
          {new Date(run.started_at).toLocaleString("zh-CN")}
        </span>
        <span className="text-[11px] text-muted-foreground/50">
          {formatDuration(run.duration_ms)}
        </span>
        {run.sources_count > 0 && (
          <span className="text-[11px] text-muted-foreground/50">
            {t("sourcesCount", { count: run.sources_count })}
          </span>
        )}
      </div>

      {run.result_summary && (
        <p className="mt-1 text-[11px] text-muted-foreground/60">{run.result_summary}</p>
      )}
      {run.error_message && (
        <p className="mt-1 text-[11px] text-red-400/70">{run.error_message}</p>
      )}
    </div>
  );
}

export function TaskHistoryDialog({
  taskId,
  taskName,
  onClose,
}: {
  taskId: string;
  taskName: string;
  onClose: () => void;
}) {
  const t = useTranslations("tasks");
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["task-runs", taskId],
    queryFn: () => getTaskRuns(taskId),
  });

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <m.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="mx-4 max-h-[70vh] w-full max-w-lg overflow-hidden rounded-2xl border border-border/40 bg-card shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border/30 px-5 py-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-primary" />
              <span className="text-[14px] font-semibold text-foreground/90">
                {t("historyTitle", { name: taskName })}
              </span>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground/50 hover:text-foreground">
              <X size={14} />
            </button>
          </div>

          <div className="max-h-[55vh] overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={18} className="animate-spin text-muted-foreground/50" />
              </div>
            ) : runs.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground/50">
                {t("noHistory")}
              </p>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <RunItem key={run.id} run={run} />
                ))}
              </div>
            )}
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}
