"use client";

/**
 * @file portrait-cards.tsx
 * @description 自我画像页面的所有卡片组件：
 *   - IdentityHeroCard     身份 Hero 卡（打字机 + 置信环 + 浮动 tag）
 *   - KnowledgeMapCard     知识版图（分组浮动泡泡）
 *   - ThoughtStream        研究轨迹时间线（竖线生长 + 节点滑入）
 *   - InteractionStyleCard 互动偏好
 *   - GrowthVelocityCard   学习节律
 *   - GrowthSignalsCard    成长信号（弹跳入场 + 闪光点）
 *   - LyraNotesCard        Lyra 私人备注（逐词渐入）
 */

import { useRef } from "react";
import { m, useInView } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Brain,
  Map,
  TrendingUp,
  Zap,
  BookOpen,
  Target,
  Lightbulb,
  MessageCircle,
  ArrowRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserPortrait } from "@/services/portrait-service";
import {
  TypewriterText,
  ConfidenceRing,
  FloatingTag,
} from "./portrait-primitives";

/* ─── IdentityHeroCard ───────────────────────────── */

export function IdentityHeroCard({ portrait }: { portrait: UserPortrait }) {
  const t = useTranslations("portraitCards");
  const identity = portrait.identity;

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{
        opacity: 1,
        y: 0,
        boxShadow: [
          "0 0 0px rgba(139,92,246,0), 0 0 0px rgba(139,92,246,0)",
          "0 0 28px rgba(139,92,246,0.18), 0 0 60px rgba(99,102,241,0.08)",
          "0 0 12px rgba(139,92,246,0.10), 0 0 30px rgba(99,102,241,0.04)",
          "0 0 28px rgba(139,92,246,0.18), 0 0 60px rgba(99,102,241,0.08)",
          "0 0 0px rgba(139,92,246,0), 0 0 0px rgba(139,92,246,0)",
        ],
      }}
      transition={{
        opacity: { duration: 0.5 },
        y: { duration: 0.5 },
        boxShadow: { delay: 0.5, duration: 6, repeat: Infinity, ease: "easeInOut" },
      }}
      className="relative overflow-hidden rounded-2xl border border-violet-500/20 p-6"
      style={{
        background:
          "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(99,102,241,0.05) 50%, rgba(15,23,42,0.02) 100%)",
      }}
    >
      {/* Animated shimmer */}
      <m.div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.15), transparent)",
          backgroundSize: "200% 100%",
        }}
        animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
        transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
      />

      {/* Decorative orb */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-500/[0.08] blur-3xl" />

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="mb-3 flex items-center gap-2.5">
            <m.span
              className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              {t("lyraViewOfYou")}
            </m.span>
          </div>

          <p className="mb-5 max-w-2xl text-[14px] leading-[1.8] text-foreground/80">
            <TypewriterText text={portrait.identity_summary} speed={20} />
          </p>

          {identity && (
            <div className="flex flex-wrap gap-2">
              {identity.primary_role && (
                <FloatingTag
                  label={identity.primary_role}
                  icon={<Target className="h-3 w-3" />}
                  color="violet"
                  index={0}
                />
              )}
              {identity.expertise_level && (
                <FloatingTag
                  label={identity.expertise_level}
                  icon={<Zap className="h-3 w-3" />}
                  color="indigo"
                  index={1}
                />
              )}
              {identity.personality_type && (
                <FloatingTag
                  label={identity.personality_type}
                  icon={<Brain className="h-3 w-3" />}
                  color="blue"
                  index={2}
                />
              )}
            </div>
          )}
        </div>

        {identity?.confidence && (
          <m.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
            className="flex-shrink-0"
          >
            <ConfidenceRing value={identity.confidence} />
          </m.div>
        )}
      </div>
    </m.div>
  );
}

/* ─── KnowledgeMapCard ───────────────────────────── */

export function KnowledgeMapCard({ portrait }: { portrait: UserPortrait }) {
  const t = useTranslations("portraitCards");
  const km = portrait.knowledge_map;
  if (!km) return null;

  const groups = [
    { label: t("domainExpert"),   items: km.expert_domains,    color: "emerald" as const },
    { label: t("domainLearning"), items: km.learning_domains,  color: "amber"   as const },
    { label: t("domainEmerging"), items: km.emerging_interest, color: "violet"  as const },
    { label: t("domainWeak"),     items: km.weak_domains,      color: "default" as const },
  ].filter((g) => g.items?.length > 0);

  const groupColors: Record<string, string> = {
    emerald: "text-emerald-400",
    amber:   "text-amber-400",
    violet:  "text-violet-400",
    default: "text-muted-foreground/40",
  };

  const groupOffsets = groups.reduce<number[]>((acc, _g, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + groups[i - 1].items.length);
    return acc;
  }, []);

  return (
    <div className="h-full rounded-2xl border border-border/40 bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Map className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-[12px] font-semibold text-foreground/70">{t("knowledgeMap")}</span>
      </div>

      <div className="space-y-4">
        {groups.map((group, gi) => (
          <div key={group.label}>
            <p className={cn("mb-2 text-[10px] font-semibold uppercase tracking-wider", groupColors[group.color])}>
              {group.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.items.slice(0, 6).map((item, i) => (
                <FloatingTag
                  key={item}
                  label={item}
                  color={group.color}
                  index={groupOffsets[gi] + i}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── ThoughtStream ──────────────────────────────── */

export function ThoughtStream({ portrait }: { portrait: UserPortrait }) {
  const t = useTranslations("portraitCards");
  const rt = portrait.research_trajectory;
  if (!rt) return null;

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const thoughts = [
    rt.current_focus && { type: "focus" as const, text: rt.current_focus },
    ...(rt.next_likely_topics ?? []).slice(0, 4).map((t) => ({ type: "topic" as const, text: t })),
    rt.long_term_direction && { type: "direction" as const, text: rt.long_term_direction },
  ].filter(Boolean) as Array<{ type: "focus" | "topic" | "direction"; text: string }>;

  return (
    <div ref={ref} className="h-full rounded-2xl border border-border/40 bg-card p-5">
      <div className="mb-5 flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
        <span className="text-[12px] font-semibold text-foreground/70">{t("trajectory")}</span>
      </div>

      <div className="relative">
        {/* Growing vertical line centered at left-[7px] */}
        <m.div
          className="absolute left-[7px] top-0 w-[1.5px] origin-top rounded-full bg-gradient-to-b from-indigo-500/60 via-violet-500/30 to-transparent"
          style={{ height: "100%" }}
          initial={{ scaleY: 0 }}
          animate={inView ? { scaleY: 1 } : { scaleY: 0 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
        />

        <div className="space-y-4">
          {thoughts.map((thought, i) => (
            <m.div
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
              transition={{ delay: 0.3 + i * 0.15, duration: 0.4, ease: "easeOut" }}
              className="flex items-start gap-3"
            >
              {/* Dot track — fixed 16px wide */}
              <div className="relative flex w-4 flex-shrink-0 justify-center pt-[5px]">
                <m.div
                  className={cn(
                    "h-2 w-2 rounded-full border",
                    thought.type === "focus"
                      ? "border-indigo-400/70 bg-indigo-400/50"
                      : thought.type === "direction"
                      ? "border-violet-400/70 bg-violet-400/50"
                      : "border-border/50 bg-muted/50"
                  )}
                  animate={
                    thought.type === "focus"
                      ? { boxShadow: ["0 0 0px rgba(99,102,241,0)", "0 0 8px rgba(99,102,241,0.7)", "0 0 0px rgba(99,102,241,0)"] }
                      : {}
                  }
                  transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.3 }}
                />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                {thought.type === "focus" ? (
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.07] px-3 py-2.5">
                    <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-indigo-400/60">{t("currentFocus")}</p>
                    <p className="text-[12px] font-medium leading-5 text-foreground/80">{thought.text}</p>
                  </div>
                ) : thought.type === "direction" ? (
                  <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.05] px-3 py-2">
                    <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-violet-400/60">{t("longTermDirection")}</p>
                    <p className="text-[11px] leading-5 text-foreground/55">{thought.text}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-1">
                    <ArrowRight className="h-2.5 w-2.5 flex-shrink-0 text-indigo-400/40" />
                    <span className="text-[12px] text-foreground/60">{thought.text}</span>
                  </div>
                )}
              </div>
            </m.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── InteractionStyleCard ───────────────────────── */

export function InteractionStyleCard({ portrait }: { portrait: UserPortrait }) {
  const t = useTranslations("portraitCards");
  const is = portrait.interaction_style;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  if (!is) return null;

  const items = [
    { label: t("preferredDepth"),    value: is.preferred_depth },
    { label: t("answerFormat"),      value: is.answer_format },
    { label: t("preferredLanguage"), value: is.preferred_language },
    { label: t("engagementStyle"),   value: is.engagement_style },
  ].filter((item) => item.value);

  return (
    <div ref={ref} className="h-full rounded-2xl border border-border/40 bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <MessageCircle className="h-3.5 w-3.5 text-teal-400" />
        <span className="text-[12px] font-semibold text-foreground/70">{t("interactionStyle")}</span>
      </div>

      <div className="divide-y divide-border/20">
        {items.map(({ label, value }, i) => (
          <m.div
            key={label}
            initial={{ opacity: 0, y: 6 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            transition={{ delay: i * 0.09, duration: 0.32 }}
            className="py-2.5"
          >
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
              {label}
            </p>
            <p className="text-[12px] leading-[1.6] text-foreground/75">{value}</p>
          </m.div>
        ))}
      </div>
    </div>
  );
}

/* ─── GrowthVelocityCard ─────────────────────────── */

export function GrowthVelocityCard({ portrait }: { portrait: UserPortrait }) {
  const t = useTranslations("portraitCards");
  const gs = portrait.growth_signals;
  const wp = portrait.work_patterns;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  if (!gs && !wp) return null;

  const VELOCITY_LABELS = {
    low: t("velocityLow"),
    medium: t("velocityMedium"),
    high: t("velocityHigh"),
  };
  const VELOCITY_COLORS = {
    low:    "text-blue-400 bg-blue-400/10 border-blue-400/20",
    medium: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    high:   "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  };

  const velocityLabel = gs ? (VELOCITY_LABELS[gs.knowledge_velocity as keyof typeof VELOCITY_LABELS] ?? gs.knowledge_velocity) : null;
  const velocityColorClass = gs
    ? (VELOCITY_COLORS[gs.knowledge_velocity as keyof typeof VELOCITY_COLORS] ?? "text-muted-foreground/60 bg-muted/10 border-border/30")
    : null;

  const details = [
    wp?.session_style != null && { label: t("workStyle"), value: wp.session_style, short: false },
    wp?.writing_to_reading_ratio != null && {
      label: t("writeReadRatio"),
      value: `${Math.round(wp.writing_to_reading_ratio * 100)}%`,
      short: true,
    },
    wp?.prefers_deep_focus != null && {
      label: t("focusPreference"),
      value: wp.prefers_deep_focus ? t("deepFocus") : t("fragmented"),
      short: true,
    },
  ].filter(Boolean) as Array<{ label: string; value: string; short: boolean }>;

  return (
    <div ref={ref} className="h-full rounded-2xl border border-border/40 bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-[12px] font-semibold text-foreground/70">{t("growthVelocity")}</span>
      </div>

      <div className="space-y-3">
        {velocityLabel && velocityColorClass && (
          <m.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <span className={cn("rounded-full border px-3 py-1.5 text-[12px] font-semibold", velocityColorClass)}>
              {velocityLabel}
            </span>
          </m.div>
        )}

        <div className="divide-y divide-border/20">
          {details.map(({ label, value, short }, i) => (
            <m.div
              key={label}
              initial={{ opacity: 0, y: 6 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={{ delay: 0.15 + i * 0.09, duration: 0.32 }}
              className={cn("py-2.5", short && "flex items-center justify-between gap-3")}
            >
              <p className={cn(
                "text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40",
                !short && "mb-1"
              )}>
                {label}
              </p>
              <p className={cn("text-[12px] leading-[1.6] text-foreground/70", short && "font-medium")}>
                {value}
              </p>
            </m.div>
          ))}
        </div>

        {gs?.recurring_questions && gs.recurring_questions.length > 0 && (
          <m.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.45 }}
          >
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
              {t("recurringFocus")}
            </p>
            <ul className="space-y-1">
              {gs.recurring_questions.slice(0, 3).map((q) => (
                <li key={q} className="flex items-start gap-1.5 text-[11px] text-foreground/55">
                  <span className="mt-[5px] h-1 w-1 flex-shrink-0 rounded-full bg-amber-400/60" />
                  {q}
                </li>
              ))}
            </ul>
          </m.div>
        )}
      </div>
    </div>
  );
}

/* ─── GrowthSignalsCard ──────────────────────────── */

export function GrowthSignalsCard({ portrait }: { portrait: UserPortrait }) {
  const t = useTranslations("portraitCards");
  const gs = portrait.growth_signals;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  if (!gs) return null;

  return (
    <m.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45 }}
      className="rounded-2xl border border-border/40 bg-card p-5"
    >
      <div className="mb-5 flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-[12px] font-semibold text-foreground/70">{t("growthSignals")}</span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {gs.this_period_learned && gs.this_period_learned.length > 0 && (
          <div>
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">{t("recentLearned")}</p>
            <ul className="space-y-2">
              {gs.this_period_learned.slice(0, 5).map((item, i) => (
                <m.li
                  key={item}
                  initial={{ opacity: 0, scale: 0.7, x: -8 }}
                  animate={inView ? { opacity: 1, scale: 1, x: 0 } : {}}
                  transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 300, damping: 22 }}
                  className="flex items-start gap-2 text-[12px] text-foreground/65"
                >
                  <m.span
                    className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400/80"
                    animate={inView ? { scale: [1, 1.8, 1], opacity: [0.8, 1, 0.8] } : {}}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                  />
                  {item}
                </m.li>
              ))}
            </ul>
          </div>
        )}

        {gs.knowledge_gaps_detected && gs.knowledge_gaps_detected.length > 0 && (
          <div>
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-rose-400/70">{t("knowledgeGaps")}</p>
            <ul className="space-y-2">
              {gs.knowledge_gaps_detected.slice(0, 5).map((item, i) => (
                <m.li
                  key={item}
                  initial={{ opacity: 0, scale: 0.7, x: -8 }}
                  animate={inView ? { opacity: 1, scale: 1, x: 0 } : {}}
                  transition={{ delay: 0.15 + i * 0.08, type: "spring", stiffness: 300, damping: 22 }}
                  className="flex items-start gap-2 text-[12px] text-foreground/65"
                >
                  <m.span
                    className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-400/70"
                    animate={inView ? { scale: [1, 1.6, 1], opacity: [0.7, 1, 0.7] } : {}}
                    transition={{ delay: 0.6 + i * 0.1, duration: 0.45 }}
                  />
                  {item}
                </m.li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </m.div>
  );
}

/* ─── LyraNotesCard ──────────────────────────────── */

export function LyraNotesCard({ notes }: { notes: string }) {
  const t = useTranslations("portraitCards");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const words = notes.split(" ");

  return (
    <m.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45 }}
      className="flex items-start gap-3 rounded-2xl border border-violet-500/10 bg-violet-500/[0.04] px-5 py-4"
    >
      <m.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 2.8 }}
      >
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-400/60" />
      </m.div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-violet-400/55">
          {t("lyraPrivateNotes")}
        </p>
        <p className="text-[12px] leading-[1.8] text-foreground/55 italic">
          {words.map((word, i) => (
            <m.span
              key={i}
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 0.2 + i * 0.04, duration: 0.3 }}
            >
              {word}{" "}
            </m.span>
          ))}
        </p>
      </div>
    </m.div>
  );
}
