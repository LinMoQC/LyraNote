"use client";

/**
 * @file 推理过程折叠块
 * @description 展示 AI 的 chain-of-thought 推理内容，支持流式动画和手动展开/收起。
 */

import { useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "./utils";

function ThinkingSparkle({ streaming }: { streaming?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn(
        "flex-shrink-0",
        streaming ? "animate-pulse text-blue-400" : "text-blue-400/70",
      )}
    >
      <path d="M8 0L9.2 5.3L14 4L10.5 7.5L16 8L10.5 8.5L14 12L9.2 10.7L8 16L6.8 10.7L2 12L5.5 8.5L0 8L5.5 7.5L2 4L6.8 5.3Z" />
    </svg>
  );
}

export function ReasoningBlock({ content, streaming }: { content: string; streaming?: boolean }) {
  const t = useTranslations("chat");
  const [expanded, setExpanded] = useState(false);
  const [userToggled, setUserToggled] = useState(false);

  const isOpen = userToggled ? expanded : (streaming || expanded);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => { setExpanded((o) => !o); setUserToggled(true); }}
        className="group flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground/80 transition-colors hover:text-foreground"
      >
        <ThinkingSparkle streaming={streaming} />
        <span className="font-medium">
          {streaming ? t("thinkingInProgress") : t("reasoning")}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={cn(
            "text-muted-foreground/50 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        >
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="max-h-72 overflow-y-auto border-l-2 border-muted-foreground/15 pl-4 pt-1">
              <div className="whitespace-pre-wrap text-[13px] italic leading-relaxed text-muted-foreground/60">
                {content}
                {streaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-blue-400/50" />}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
