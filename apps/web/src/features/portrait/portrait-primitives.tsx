"use client";

/**
 * @file portrait-primitives.tsx
 * @description 自我画像页面的动画基元组件：
 *   - TypewriterText  逐字符打字机效果
 *   - ConfidenceRing  SVG 置信度圆环动画
 *   - FloatingTag     弹跳入场 + 持续浮动的标签泡泡
 */

import { useEffect, useState } from "react";
import { m } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/* ─── TypewriterText ─────────────────────────────── */

export function TypewriterText({
  text,
  speed = 22,
  className,
}: {
  text: string;
  speed?: number;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    if (!text) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span className={className}>
      {displayed}
      {!done && (
        <m.span
          className="ml-px inline-block h-[1em] w-[2px] bg-violet-400/70 align-text-bottom"
          animate={{ opacity: [1, 0] }}
          transition={{ repeat: Infinity, duration: 0.6 }}
        />
      )}
    </span>
  );
}

/* ─── ConfidenceRing ─────────────────────────────── */

export function ConfidenceRing({ value }: { value: number }) {
  const t = useTranslations("portrait");
  const r = 20;
  const circ = 2 * Math.PI * r;
  const target = circ * (1 - value);

  return (
    <div className="relative flex items-center justify-center" style={{ width: 52, height: 52 }}>
      <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(139,92,246,0.12)" strokeWidth="2.5" />
        <m.circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="rgba(167,139,250,0.7)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: target }}
          transition={{ duration: 1.4, delay: 0.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <m.span
          className="text-[11px] font-bold text-violet-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          {Math.round(value * 100)}%
        </m.span>
        <span className="text-[8px] text-violet-400/50">{t("trusted")}</span>
      </div>
    </div>
  );
}

/* ─── FloatingTag ────────────────────────────────── */

export type FloatingTagColor =
  | "violet"
  | "indigo"
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "default";

const TAG_COLOR_MAP: Record<FloatingTagColor, string> = {
  violet:  "border-violet-500/25 bg-violet-500/10 text-violet-300/85 hover:bg-violet-500/20",
  indigo:  "border-indigo-500/25 bg-indigo-500/10 text-indigo-300/85 hover:bg-indigo-500/20",
  blue:    "border-blue-500/25 bg-blue-500/10 text-blue-300/85 hover:bg-blue-500/20",
  emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300/85 hover:bg-emerald-500/20",
  amber:   "border-amber-500/25 bg-amber-500/10 text-amber-300/80 hover:bg-amber-500/20",
  rose:    "border-rose-500/25 bg-rose-500/10 text-rose-300/80 hover:bg-rose-500/20",
  default: "border-border/30 bg-muted/15 text-foreground/60 hover:bg-muted/25",
};

export function FloatingTag({
  label,
  icon,
  color = "default",
  index = 0,
}: {
  label: string;
  icon?: React.ReactNode;
  color?: FloatingTagColor;
  index?: number;
}) {
  const amp = 3 + (index % 3);
  const dur = 3.0 + (index * 0.35) % 2.2;
  const entryDelay = index * 0.032;

  return (
    <m.span
      initial={{ opacity: 0, scale: 0.78, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 20, delay: entryDelay }}
      style={{ display: "inline-flex" }}
    >
      <m.span
        animate={{
          y: [0, -(amp + 2.5), -(amp + 0.5), -(amp - 1), 0, 1, 0],
        }}
        transition={{
          delay: entryDelay + 0.25,
          duration: dur,
          repeat: Infinity,
          ease: ["easeOut", "easeIn", "easeInOut", "easeIn", "easeOut", "easeInOut"],
          times: [0, 0.30, 0.48, 0.65, 0.82, 0.92, 1],
        }}
        className={cn(
          "inline-flex cursor-default items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
          TAG_COLOR_MAP[color]
        )}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {label}
      </m.span>
    </m.span>
  );
}
