"use client";

import { AnimatePresence, m } from "framer-motion";
import { useEffect, useMemo } from "react";
import { SoulCard } from "@/features/copilot/soul-card";
import { ProactiveCard } from "@/features/copilot/proactive-card";
import { useProactiveStore } from "@/store/use-proactive-store";

const AUTO_HIDE_MS = 10_000;

export function ProactiveToaster({
  onAsk,
}: {
  onAsk: (text: string) => void;
}) {
  const suggestions = useProactiveStore((s) => s.suggestions);
  const hideSuggestion = useProactiveStore((s) => s.hideSuggestion);
  const visibleSuggestion = useMemo(() => {
    const surfaced = suggestions
      .filter((suggestion) => suggestion.delivery === "surface" && !suggestion.read && !suggestion.hiddenAt)
      .sort((a, b) => (a.surfacedAt ?? a.createdAt) - (b.surfacedAt ?? b.createdAt));

    return surfaced[0] ?? null;
  }, [suggestions]);

  useEffect(() => {
    if (!visibleSuggestion) return;

    const timer = window.setTimeout(() => {
      hideSuggestion(visibleSuggestion.id);
    }, AUTO_HIDE_MS);

    return () => window.clearTimeout(timer);
  }, [hideSuggestion, visibleSuggestion]);

  if (!visibleSuggestion) return null;

  return (
    <div className="pointer-events-none absolute top-16 right-8 z-[60] flex w-[320px] flex-col items-end">
      <AnimatePresence mode="wait">
        <m.div
          key={visibleSuggestion.id}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, x: 40, scale: 0.9, transition: { duration: 0.2 } }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="pointer-events-auto w-full shadow-2xl shadow-black/20"
          style={{ originY: 0, originX: 1 }}
        >
          {visibleSuggestion.type === "insight" ? (
            <SoulCard suggestion={visibleSuggestion} onReply={(text) => onAsk(text)} />
          ) : (
            <ProactiveCard
              suggestion={visibleSuggestion}
              onAskQuestion={(text) => onAsk(text)}
            />
          )}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
