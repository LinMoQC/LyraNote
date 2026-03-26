"use client";

import { useQuery } from "@tanstack/react-query";
import { m } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { getSuggestions } from "@/services/ai-service";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  onSelect: (text: string) => void;
}

export function HomeSuggestions({ onSelect }: Props) {
  const t = useTranslations("home");

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["chat-suggestions"],
    queryFn: getSuggestions,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: true,
    retry: false,
  });

  return (
    <div>
      <p className="mb-3 px-1 text-xs font-medium uppercase tracking-widest text-muted-foreground/40">
        {t("suggestedQuestions")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-[52px] rounded-xl border border-border/30 bg-muted/30"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))
          : (suggestions ?? []).map((text, i) => (
              <m.button
                key={text}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => onSelect(text)}
                className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/30 px-4 py-3 text-left transition-colors hover:border-border/60 hover:bg-accent/60 hover:text-foreground"
              >
                <Sparkles size={13} className="flex-shrink-0 text-primary/70" />
                <span className="text-xs text-muted-foreground">{text}</span>
              </m.button>
            ))}
      </div>
    </div>
  );
}
