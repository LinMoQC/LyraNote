"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "framer-motion";
import { Bell, Check, Eye, Lightbulb } from "lucide-react";
import Link from "next/link";

import {
  getInsights,
  markAllInsightsRead,
  markInsightRead,
  type ProactiveInsight,
} from "@/services/ai-service";

const TYPE_CONFIG: Record<string, { icon: typeof Lightbulb; color: string }> = {
  source_indexed: { icon: Bell, color: "text-blue-400" },
  task_completed: { icon: Check, color: "text-emerald-400" },
  knowledge_update: { icon: Lightbulb, color: "text-amber-400" },
};

function InsightItem({
  insight,
  onRead,
}: {
  insight: ProactiveInsight;
  onRead: () => void;
}) {
  const cfg = TYPE_CONFIG[insight.insight_type] || TYPE_CONFIG.knowledge_update!;
  const Icon = cfg.icon;

  return (
    <m.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
        insight.is_read
          ? "border-border/20 bg-card/30"
          : "border-primary/15 bg-primary/[0.03]"
      }`}
    >
      <Icon size={13} className={`mt-0.5 flex-shrink-0 ${cfg.color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-foreground/80">
          {insight.title}
        </p>
        {insight.content && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/50">
            {insight.content}
          </p>
        )}
        <div className="mt-1 flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/40">
            {new Date(insight.created_at).toLocaleString("zh-CN")}
          </span>
          {insight.notebook_id && (
            <Link
              href={`/app/notebooks/${insight.notebook_id}`}
              className="text-[10px] text-primary/50 hover:text-primary/80"
            >
              查看笔记本
            </Link>
          )}
          {!insight.is_read && (
            <button
              type="button"
              onClick={onRead}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-foreground/60"
            >
              <Eye size={9} />
              标记已读
            </button>
          )}
        </div>
      </div>
    </m.div>
  );
}

export function InsightsBar() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["insights"],
    queryFn: getInsights,
    refetchInterval: 60_000,
  });

  const readMutation = useMutation({
    mutationFn: markInsightRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insights"] }),
  });

  const readAllMutation = useMutation({
    mutationFn: markAllInsightsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insights"] }),
  });

  const insights = data?.insights ?? [];
  const unreadCount = data?.unread_count ?? 0;

  if (insights.length === 0) return null;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground/40">
          <Lightbulb size={11} />
          AI 洞察
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary">
              {unreadCount}
            </span>
          )}
        </p>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => readAllMutation.mutate()}
            className="text-[11px] text-muted-foreground/40 hover:text-foreground/60"
          >
            全部已读
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        <AnimatePresence>
          {insights.slice(0, 5).map((insight) => (
            <InsightItem
              key={insight.id}
              insight={insight}
              onRead={() => readMutation.mutate(insight.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
