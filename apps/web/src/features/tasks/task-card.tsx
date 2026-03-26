"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Clock,
  History,
  Mail,
  NotepadText,
  Play,
  Rss,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { m } from "framer-motion";
import { useTranslations } from "next-intl";

import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  deleteTask,
  runTaskManually,
  updateTask,
  type ScheduledTask,
} from "@/services/task-service";
import { TaskHistoryDialog } from "./task-history-dialog";

const DELIVERY_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  note: NotepadText,
  both: Mail,
};

const CRON_KEYS: Record<string, string> = {
  "0 8 * * *":    "cronDaily",
  "0 9 * * 1":    "cronWeekly",
  "0 9 1,15 * *": "cronBimonthly",
  "0 9 1 * *":    "cronMonthly",
  "0 8 */3 * *":  "cronEvery3Days",
};

export function TaskCard({ task }: { task: ScheduledTask }) {
  const t = useTranslations("tasks");
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const { success, error } = useToast();

  function formatCron(cron: string): string {
    const key = CRON_KEYS[cron];
    return key ? t(key) : cron;
  }

  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const absDiffMs = Math.abs(diffMs);
    const minutes = Math.floor(absDiffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (diffMs > 0) {
      if (minutes < 60) return t("minutesLater", { minutes });
      if (hours < 24) return t("hoursLater", { hours });
      return t("daysLater", { days });
    }
    if (minutes < 60) return t("minutesAgo", { minutes });
    if (hours < 24) return t("hoursAgo", { hours });
    return t("daysAgo", { days });
  }

  const DELIVERY_LABELS: Record<string, string> = {
    email: t("deliveryLabelEmail"),
    note:  t("deliveryLabelNote"),
    both:  t("deliveryLabelBoth"),
  };

  const toggleMutation = useMutation({
    mutationFn: () => updateTask(task.id, { enabled: !task.enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      success(task.enabled ? t("paused") : t("enabled"));
    },
    onError: () => error(t("toggleFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      success(t("deleted"));
    },
    onError: () => error(t("deleteFailed")),
  });

  const runMutation = useMutation({
    mutationFn: () => runTaskManually(task.id),
    onSuccess: () => success(t("queued")),
    onError: () => error(t("runFailed")),
  });

  const deliveryMethod = task.delivery_config?.method as string;
  const DeliveryIcon = DELIVERY_ICONS[deliveryMethod] || Mail;
  const topic = (task.parameters?.topic as string) || "";
  const feedUrls = (task.parameters?.feed_urls as string[]) || [];

  return (
    <>
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="group flex h-full flex-col rounded-2xl border border-border/40 bg-card transition-all hover:border-border/60 hover:shadow-lg"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-snug text-foreground">
              {task.name}
            </h3>
            {topic && (
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground/70">
                {topic}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => toggleMutation.mutate()}
            className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
              task.enabled ? "bg-primary" : "bg-muted/60"
            }`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                task.enabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        {/* Metadata tags */}
        <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/30 px-2 py-0.5 text-[12px] text-muted-foreground/70">
            <Calendar size={11} className="shrink-0" />
            {formatCron(task.schedule_cron)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/30 px-2 py-0.5 text-[12px] text-muted-foreground/70">
            <DeliveryIcon size={11} className="shrink-0" />
            {deliveryMethod === "email" && task.delivery_config?.email
              ? t("emailDelivery", { email: task.delivery_config.email as string })
              : DELIVERY_LABELS[deliveryMethod] || t("deliveryLabelNote")}
          </span>
          {feedUrls.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-0.5 text-[12px] text-orange-400">
              <Rss size={11} className="shrink-0" />
              {t("feedCount", { count: feedUrls.length })}
            </span>
          )}
        </div>

        {/* Execution info */}
        <div className="mx-5 mb-4 space-y-1.5 rounded-xl bg-muted/15 px-3.5 py-2.5 text-[12px] leading-relaxed">
          {task.last_run_at && (
            <div className="flex items-start gap-2 text-muted-foreground/60">
              <CheckCircle2 size={12} className="mt-[3px] shrink-0 text-green-400/70" />
              <span>
                {t("lastRun", { time: formatRelativeTime(task.last_run_at) })}
                {task.last_result && (
                  <span className="ml-1 text-muted-foreground/40">
                    · {task.last_result}
                  </span>
                )}
              </span>
            </div>
          )}
          {task.last_error && (
            <div className="flex items-start gap-2 text-red-400/70">
              <Clock size={12} className="mt-[3px] shrink-0" />
              <span className="line-clamp-1">{t("errorPrefix", { error: task.last_error })}</span>
            </div>
          )}
          <div className="flex items-start gap-2 text-muted-foreground/50">
            <Clock size={12} className="mt-[3px] shrink-0" />
            <span>
              {t("nextRun", { time: formatRelativeTime(task.next_run_at) })}
              {task.run_count > 0 && (
                <span className="ml-1 text-muted-foreground/40">
                  · {t("runCount", { count: task.run_count })}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-1.5 border-t border-border/20 px-4 py-3">
          <button
            type="button"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            <Play size={11} />
            {t("runNow")}
          </button>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground/80"
          >
            <History size={11} />
            {t("history")}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="rounded-lg p-1.5 text-muted-foreground/30 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </m.div>

      {showHistory && (
        <TaskHistoryDialog
          taskId={task.id}
          taskName={task.name}
          onClose={() => setShowHistory(false)}
        />
      )}

      <Dialog
        open={showDelete}
        title={t("deleteTitle")}
        description={t("deleteConfirm", { name: task.name })}
        onClose={() => setShowDelete(false)}
        className="max-w-sm"
      >
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setShowDelete(false)}
            className="rounded-xl px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              deleteMutation.mutate();
              setShowDelete(false);
            }}
            disabled={deleteMutation.isPending}
            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            {t("delete")}
          </button>
        </div>
      </Dialog>
    </>
  );
}
