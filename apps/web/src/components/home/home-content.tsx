"use client";

import { useRouter } from "next/navigation";

import { HomeQA } from "./home-qa";
import { HomeSuggestions } from "./home-suggestions";

export function HomeContent() {
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

  return (
    <div className="space-y-8">
      <HomeQA />
      <HomeSuggestions onSelect={handleSuggestionSelect} />
    </div>
  );
}
