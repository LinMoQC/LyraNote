"use client";

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

import { HomeQA } from "./home-qa";
import { HomeSuggestions } from "./home-suggestions";

export function HomeContent({
  showQa = true,
  showSuggestions = true,
  suggestionsVariant = "default",
  qaShowHint = true,
  order = "qa-first",
  className,
}: HomeContentProps) {
  const router = useRouter();

  function handleSuggestionSelect(text: string) {
    try {
      sessionStorage.setItem(
        "pending-chat-query",
        JSON.stringify({ q: text, deep_research: "0", dr_mode: "quick" }),
      );
    } catch {
      // ignore if sessionStorage is unavailable
    }
    router.push("/app/chat");
  }

  const suggestionsNode = showSuggestions ? (
    <HomeSuggestions
      onSelect={handleSuggestionSelect}
      variant={suggestionsVariant}
    />
  ) : null;

  const qaNode = showQa ? <HomeQA showHint={qaShowHint} /> : null;

  return (
    <div className={cn("space-y-8", className)}>
      {order === "suggestions-first" ? suggestionsNode : qaNode}
      {order === "suggestions-first" ? qaNode : suggestionsNode}
    </div>
  );
}

interface HomeContentProps {
  showQa?: boolean;
  showSuggestions?: boolean;
  suggestionsVariant?: "default" | "hero";
  qaShowHint?: boolean;
  order?: "qa-first" | "suggestions-first";
  className?: string;
}
