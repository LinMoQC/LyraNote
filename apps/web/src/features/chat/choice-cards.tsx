"use client";

import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Choice {
  label: string;
  value: string;
}

interface ChoiceCardsProps {
  choices: Choice[];
  onSelect: (value: string) => void;
}

export function ChoiceCards({ choices, onSelect }: ChoiceCardsProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {choices.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            if (selected) return;
            setSelected(c.value);
            onSelect(c.value);
          }}
          className={cn(
            "group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150",
            selected === c.value
              ? "border-primary/50 bg-primary/10 text-primary"
              : selected
                ? "cursor-not-allowed border-border/20 text-muted-foreground/30 opacity-40"
                : "border-border/50 bg-background/50 text-foreground/65 hover:border-primary/40 hover:bg-primary/[0.07] hover:text-primary/90",
          )}
          disabled={!!selected}
        >
          <Sparkles size={10} className="shrink-0 opacity-50" />
          <span>{c.label}</span>
          <ChevronRight
            size={10}
            className={cn(
              "shrink-0 opacity-40 transition-transform duration-150",
              !selected && "group-hover:translate-x-0.5 group-hover:opacity-70",
            )}
          />
        </button>
      ))}
    </div>
  );
}

const CHOICES_REGEX = /```choices\n([\s\S]*?)\n```/;

export function parseChoicesBlock(content: string): {
  textBefore: string;
  choices: Choice[] | null;
} {
  const match = CHOICES_REGEX.exec(content);
  if (!match) return { textBefore: content, choices: null };

  const textBefore = content.slice(0, match.index).trimEnd();
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed) || parsed.length === 0) return { textBefore: content, choices: null };
    const valid = parsed.every((c: unknown) =>
      typeof c === "object" && c !== null && "label" in c && "value" in c,
    );
    if (!valid) return { textBefore: content, choices: null };
    return { textBefore, choices: parsed as Choice[] };
  } catch {
    return { textBefore: content, choices: null };
  }
}
