"use client";

import { Lightbulb, MessageCircle, X } from "lucide-react";
import { m } from "framer-motion";
import { memo } from "react";
import type { ProactiveSuggestion } from "@/store/use-proactive-store";
import { useProactiveStore } from "@/store/use-proactive-store";

export const ProactiveCard = memo(function ProactiveCard({
  suggestion,
  onAskQuestion,
}: {
  suggestion: ProactiveSuggestion;
  onAskQuestion: (question: string) => void;
}) {
  const dismiss = useProactiveStore((s) => s.dismissSuggestion);

  return (
    <m.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="relative rounded-xl border border-primary/15 bg-primary/[0.04] p-3"
    >
      <button
        type="button"
        onClick={() => dismiss(suggestion.id)}
        className="absolute right-2 top-2 rounded-md p-0.5 text-muted-foreground/30 transition-colors hover:text-muted-foreground/60"
      >
        <X size={11} />
      </button>

      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10">
          <Lightbulb size={11} className="text-primary" />
        </div>
        <span className="text-[11px] font-medium text-primary/80">
          {suggestion.type === "source_indexed" ? "资料已就绪" : "AI 洞察"}
        </span>
      </div>

      {suggestion.sourceName && (
        <p className="mb-1.5 text-[12px] font-medium text-foreground/80">
          「{suggestion.sourceName}」已索引完成
        </p>
      )}

      {suggestion.summary && (
        <p className="mb-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground/70">
          {suggestion.summary}
        </p>
      )}

      {suggestion.message && (
        <p className="mb-2 text-[12px] leading-4 text-foreground/70">
          {suggestion.message}
        </p>
      )}

      {suggestion.questions && suggestion.questions.length > 0 && (
        <div className="space-y-1">
          {suggestion.questions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onAskQuestion(q)}
              className="flex w-full items-center gap-2 rounded-lg border border-border/30 bg-background px-2.5 py-1.5 text-left text-[11px] text-foreground/70 transition-colors hover:border-primary/20 hover:bg-primary/[0.04] hover:text-foreground/90"
            >
              <MessageCircle size={10} className="flex-shrink-0 text-muted-foreground/50" />
              <span className="line-clamp-1">{q}</span>
            </button>
          ))}
        </div>
      )}
    </m.div>
  );
});
