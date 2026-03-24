"use client";

/**
 * @file Portrait View — Lyra 对你的了解
 * @description 展示 Lyra 通过长期交互积累的用户画像，包括身份认知、
 *              知识版图、研究轨迹和成长信号。
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { m } from "framer-motion";
import {
  Brain,
  Map,
  TrendingUp,
  Zap,
  RefreshCw,
  BookOpen,
  Target,
  Lightbulb,
  ChevronRight,
} from "lucide-react";

import { getMyPortrait, triggerPortraitSynthesis, type UserPortrait } from "@/services/portrait-service";
import { cn } from "@/lib/utils";
import { notifySuccess, notifyError } from "@/lib/notify";

const VELOCITY_LABELS = { low: "稳步积累", medium: "较快成长", high: "快速进阶" };
const VELOCITY_COLORS = { low: "text-blue-400", medium: "text-amber-400", high: "text-emerald-400" };

export function PortraitView() {
  const { data: portrait, isLoading, refetch } = useQuery({
    queryKey: ["portrait"],
    queryFn: getMyPortrait,
  });

  const [triggering, setTriggering] = useState(false);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerPortraitSynthesis();
      notifySuccess("正在后台合成画像，稍后刷新查看");
      setTimeout(() => refetch(), 5000);
    } catch {
      notifyError("触发失败，请稍后再试");
    } finally {
      setTriggering(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground/50">
          <Brain className="mx-auto mb-3 h-8 w-8 animate-pulse" />
          <p className="text-sm">Lyra 正在回想...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15">
                <Brain className="h-4 w-4 text-violet-400" />
              </div>
              <h1 className="text-xl font-semibold text-foreground/90">Lyra 对你的了解</h1>
            </div>
            <p className="text-sm text-muted-foreground/60">
              {portrait
                ? "基于你的使用记录，Lyra 形成了对你的立体认知"
                : "数据积累中——和 Lyra 多聊几次，她会越来越了解你"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleTrigger}
            disabled={triggering}
            className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 text-[12px] text-muted-foreground/70 transition-colors hover:border-border hover:text-foreground/80 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", triggering && "animate-spin")} />
            更新画像
          </button>
        </div>

        {!portrait ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {/* Identity Summary */}
            <IdentitySummaryCard portrait={portrait} />

            {/* Knowledge Map + Research Trajectory */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <KnowledgeMapCard portrait={portrait} />
              <ResearchTrajectoryCard portrait={portrait} />
            </div>

            {/* Growth Signals */}
            <GrowthSignalsCard portrait={portrait} />

            {/* Lyra's Notes */}
            {portrait.lyra_service_notes && (
              <LyraNotesCard notes={portrait.lyra_service_notes} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border/50 p-12 text-center">
      <Brain className="mx-auto mb-4 h-10 w-10 text-muted-foreground/20" />
      <p className="mb-1 text-sm font-medium text-foreground/50">画像尚未生成</p>
      <p className="text-xs text-muted-foreground/40">
        与 Lyra 完成更多对话后，她会自动形成对你的深度认知
      </p>
    </div>
  );
}

function IdentitySummaryCard({ portrait }: { portrait: UserPortrait }) {
  const identity = portrait.identity;
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.05] to-indigo-500/[0.03] p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-400/80">
          Lyra 眼中的你
        </span>
        {identity?.confidence && (
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-400/60">
            可信度 {Math.round(identity.confidence * 100)}%
          </span>
        )}
      </div>
      <p className="mb-4 text-[14px] leading-6 text-foreground/80">
        {portrait.identity_summary}
      </p>
      {identity && (
        <div className="flex flex-wrap gap-2">
          {identity.primary_role && (
            <Tag icon={<Target className="h-3 w-3" />} label={identity.primary_role} />
          )}
          {identity.expertise_level && (
            <Tag icon={<Zap className="h-3 w-3" />} label={identity.expertise_level} />
          )}
          {identity.personality_type && (
            <Tag icon={<Brain className="h-3 w-3" />} label={identity.personality_type} />
          )}
        </div>
      )}
    </m.div>
  );
}

function KnowledgeMapCard({ portrait }: { portrait: UserPortrait }) {
  const km = portrait.knowledge_map;
  if (!km) return null;
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-2xl border border-border/40 bg-card p-5"
    >
      <div className="mb-3 flex items-center gap-1.5">
        <Map className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-[12px] font-semibold text-foreground/70">知识版图</span>
      </div>
      <div className="space-y-2.5">
        {km.expert_domains?.length > 0 && (
          <KnowledgeGroup label="已掌握" items={km.expert_domains} color="text-emerald-400" dotColor="bg-emerald-400" />
        )}
        {km.learning_domains?.length > 0 && (
          <KnowledgeGroup label="正在学" items={km.learning_domains} color="text-amber-400" dotColor="bg-amber-400" />
        )}
        {km.emerging_interest?.length > 0 && (
          <KnowledgeGroup label="新兴兴趣" items={km.emerging_interest} color="text-violet-400" dotColor="bg-violet-400" />
        )}
        {km.weak_domains?.length > 0 && (
          <KnowledgeGroup label="待探索" items={km.weak_domains} color="text-muted-foreground/50" dotColor="bg-muted-foreground/30" />
        )}
      </div>
    </m.div>
  );
}

function ResearchTrajectoryCard({ portrait }: { portrait: UserPortrait }) {
  const rt = portrait.research_trajectory;
  if (!rt) return null;
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl border border-border/40 bg-card p-5"
    >
      <div className="mb-3 flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
        <span className="text-[12px] font-semibold text-foreground/70">研究轨迹</span>
      </div>
      <div className="space-y-2">
        {rt.current_focus && (
          <div>
            <p className="mb-0.5 text-[10px] text-muted-foreground/50">当前重心</p>
            <p className="text-[12px] font-medium text-foreground/80">{rt.current_focus}</p>
          </div>
        )}
        {rt.next_likely_topics?.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] text-muted-foreground/50">可能探索方向</p>
            <div className="space-y-1">
              {rt.next_likely_topics.slice(0, 3).map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <ChevronRight className="h-2.5 w-2.5 text-indigo-400/60" />
                  <span className="text-[11px] text-foreground/60">{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {rt.long_term_direction && (
          <div className="rounded-lg border border-border/30 bg-muted/10 px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground/50">长期方向</p>
            <p className="mt-0.5 text-[11px] text-foreground/60">{rt.long_term_direction}</p>
          </div>
        )}
      </div>
    </m.div>
  );
}

function GrowthSignalsCard({ portrait }: { portrait: UserPortrait }) {
  const gs = portrait.growth_signals;
  if (!gs) return null;
  const velocityLabel = VELOCITY_LABELS[gs.knowledge_velocity] ?? gs.knowledge_velocity;
  const velocityColor = VELOCITY_COLORS[gs.knowledge_velocity] ?? "text-muted-foreground/60";
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-2xl border border-border/40 bg-card p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-[12px] font-semibold text-foreground/70">成长信号</span>
        </div>
        <span className={cn("text-[11px] font-medium", velocityColor)}>
          {velocityLabel}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {gs.this_period_learned?.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] text-muted-foreground/50">近期新学</p>
            <ul className="space-y-1">
              {gs.this_period_learned.slice(0, 4).map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-[11px] text-foreground/65">
                  <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-amber-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {gs.knowledge_gaps_detected?.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] text-muted-foreground/50">待填充的知识空白</p>
            <ul className="space-y-1">
              {gs.knowledge_gaps_detected.slice(0, 4).map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-[11px] text-foreground/65">
                  <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-rose-400/60" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </m.div>
  );
}

function LyraNotesCard({ notes }: { notes: string }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl border border-violet-500/10 bg-violet-500/[0.03] p-4"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-violet-400/70" />
        <span className="text-[11px] font-semibold text-violet-400/70">Lyra 的私人备注</span>
      </div>
      <p className="text-[12px] leading-5 text-foreground/60">{notes}</p>
    </m.div>
  );
}

function Tag({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-border/40 bg-muted/20 px-2.5 py-1 text-[11px] text-foreground/60">
      {icon}
      {label}
    </span>
  );
}

function KnowledgeGroup({
  label,
  items,
  color,
  dotColor,
}: {
  label: string;
  items: string[];
  color: string;
  dotColor: string;
}) {
  return (
    <div>
      <p className={cn("mb-1 text-[10px] font-medium", color)}>{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 5).map((item) => (
          <span
            key={item}
            className="flex items-center gap-1 rounded-full border border-border/30 bg-muted/10 px-2 py-0.5 text-[10px] text-foreground/60"
          >
            <span className={cn("h-1 w-1 flex-shrink-0 rounded-full", dotColor)} />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
