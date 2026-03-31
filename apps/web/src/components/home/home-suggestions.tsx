"use client";

import { useQuery } from "@tanstack/react-query";
import { m } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { getSuggestions } from "@/services/ai-service";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  onSelect: (text: string) => void;
  variant?: "default" | "hero";
}

export function HomeSuggestions({ onSelect, variant = "default" }: Props) {
  const t = useTranslations("home");
  const isHero = variant === "hero";

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["chat-suggestions"],
    queryFn: getSuggestions,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: true,
    retry: false,
  });
  const heroSuggestions = (suggestions ?? []).slice(0, 4);
  const marqueeSuggestions = [...heroSuggestions, ...heroSuggestions];

  return (
    <div>
      {isHero ? null : (
        <p className="mb-3 px-1 text-xs font-medium uppercase tracking-widest text-muted-foreground/40">
          {t("suggestedQuestions")}
        </p>
      )}
      <div className={cn(
        "relative",
        isHero ? "relative left-1/2 w-screen -translate-x-1/2 overflow-hidden pb-1" : "grid grid-cols-2 gap-2",
      )}>
        {isLoading
          ? isHero ? (
              <>
                <div
                  data-testid="home-suggestions-hero-loading"
                  className="flex w-max gap-3"
                >
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="inline-flex h-11 min-w-[168px] rounded-full border border-white/6 bg-white/[0.03]"
                      style={{ animationDelay: `${i * 80}ms` }}
                    />
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background via-background/18 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background via-background/18 to-transparent" />
              </>
            ) : (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-[52px] rounded-xl border border-border/30 bg-muted/30"
                  style={{ animationDelay: `${i * 80}ms` }}
                />
              ))
            )
          : isHero ? (
              <>
                <m.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    x: heroSuggestions.length > 1 ? ["0%", "-50%"] : "0%",
                  }}
                  transition={{
                    opacity: { duration: 0.28 },
                    y: { duration: 0.28 },
                    x: heroSuggestions.length > 1
                      ? { duration: 18, ease: "linear", repeat: Infinity }
                      : undefined,
                  }}
                  className="flex w-max gap-3"
                >
                  {marqueeSuggestions.map((text, i) => (
                    <button
                      key={`${text}-${i}`}
                      type="button"
                      onClick={() => onSelect(text)}
                      className="flex h-11 min-w-[168px] max-w-[168px] items-center gap-2 rounded-full border border-white/6 bg-white/[0.03] px-3 text-left shadow-[0_2px_12px_rgba(0,0,0,0.10)] backdrop-blur-md transition-colors hover:border-white/10 hover:bg-white/[0.05]"
                    >
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/15">
                        <Sparkles
                          size={11}
                          className="text-primary/80"
                        />
                      </span>
                      <span className="truncate whitespace-nowrap text-xs text-foreground/88">
                        {text}
                      </span>
                    </button>
                  ))}
                </m.div>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background via-background/18 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background via-background/18 to-transparent" />
              </>
            ) : (
              heroSuggestions.map((text, i) => (
                <m.button
                  key={text}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => onSelect(text)}
                  className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/30 px-4 py-3 text-left transition-colors hover:border-border/60 hover:bg-accent/60 hover:text-foreground"
                >
                  <Sparkles
                    size={13}
                    className="flex-shrink-0 text-primary/70"
                  />
                  <span className="text-xs text-muted-foreground">
                    {text}
                  </span>
                </m.button>
              ))
            )}
      </div>
    </div>
  );
}
