"use client";

/**
 * @file SoulCard — Lyra 主动思想卡片
 * @description 展示 Lyra Soul 思维循环产生并推送给用户的主动思考。
 *              与普通 ProactiveCard 不同，SoulCard 使用更温暖的视觉语言，
 *              强调这是 Lyra 在"主动想起你"，而非机器生成的通知。
 */

import { Brain, MessageCircle, X } from "lucide-react";
import { m } from "framer-motion";
import { memo } from "react";
import { useTranslations } from "next-intl";
import type { ProactiveSuggestion } from "@/store/use-proactive-store";
import { useProactiveStore } from "@/store/use-proactive-store";

export const SoulCard = memo(function SoulCard({
  suggestion,
  onReply,
}: {
  suggestion: ProactiveSuggestion;
  onReply?: (text: string) => void;
}) {
  const t = useTranslations("copilot");
  const dismiss = useProactiveStore((s) => s.dismissSuggestion);

  const content = suggestion.message ?? suggestion.summary;
  if (!content) return null;

  const handleReply = () => {
    if (onReply) {
      onReply(content);
    }
  };

  return (
    <m.div
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="relative overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-indigo-500/[0.04] p-3"
    >
      {/* 装饰性渐变光晕 */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-violet-500/10 blur-2xl" />

      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={() => dismiss(suggestion.id)}
        className="absolute right-2 top-2 z-10 rounded-md p-0.5 text-muted-foreground/30 transition-colors hover:text-muted-foreground/60"
        aria-label={t("close")}
      >
        <X size={11} />
      </button>

      {/* 标签行 */}
      <div className="mb-2 flex items-center gap-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/15">
          <Brain size={11} className="text-violet-400" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80">
          {t("lyraThinking")}
        </span>
      </div>

      {/* 思想内容 */}
      <p className="mb-2.5 text-[12px] leading-[1.6] text-foreground/75 [text-wrap:pretty]">
        {content}
      </p>

      {/* 操作按钮 */}
      {onReply && (
        <button
          type="button"
          onClick={handleReply}
          className="flex items-center gap-1.5 rounded-lg border border-violet-500/15 bg-violet-500/[0.06] px-2.5 py-1.5 text-[11px] text-violet-300/80 transition-colors hover:border-violet-500/25 hover:bg-violet-500/10 hover:text-violet-300"
        >
          <MessageCircle size={10} />
          {t("chatWithLyra")}
        </button>
      )}
    </m.div>
  );
});
