"use client";

/**
 * @file 对话空状态组件
 * @description 当用户没有任何消息时展示的欢迎界面，包含 AI 头像、
 *              欢迎语和智能建议提示词按钮，引导用户开始对话。
 */
import { m } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { BotAvatar } from "@/components/ui/bot-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { SUGGESTED_PROMPTS } from "./chat-types";

interface ChatEmptyStateProps {
  suggestionsLoading: boolean;
  dynamicSuggestions?: string[];
  onSend: (text: string) => void;
}

/**
 * 对话页空状态展示组件
 * @param suggestionsLoading - 建议提示词是否加载中
 * @param dynamicSuggestions - 后端返回的动态建议提示词
 * @param onSend - 点击提示词后触发发送的回调
 */
export function ChatEmptyState({ suggestionsLoading, dynamicSuggestions, onSend }: ChatEmptyStateProps) {
  const t = useTranslations("chat");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8">
      <m.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="mb-6"
      >
        <BotAvatar className="h-14 w-14 rounded-2xl" />
      </m.div>
      <m.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-2 text-xl font-semibold text-foreground"
      >
        {t("welcome")}
      </m.h2>
      <m.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-8 text-sm text-muted-foreground"
      >
        {t("welcomeSubtitle")}
      </m.p>
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-8 grid w-full max-w-lg grid-cols-2 gap-2"
      >
        {suggestionsLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-[52px] rounded-xl border border-border/30 bg-muted/30"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))
          : (dynamicSuggestions?.length ? dynamicSuggestions : SUGGESTED_PROMPTS.map((p) => t(p.key))).map(
              (text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => onSend(text)}
                  className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/30 px-4 py-3 text-left transition-colors hover:border-border/60 hover:bg-accent/60 hover:text-foreground"
                >
                  <Sparkles size={14} className="flex-shrink-0 text-primary/70" />
                  <span className="text-xs text-muted-foreground">{text}</span>
                </button>
              )
            )}
      </m.div>
    </div>
  );
}
