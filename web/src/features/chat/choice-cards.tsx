"use client";

import { useState } from "react";
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
            "rounded-xl border px-3 py-2 text-sm transition-all",
            selected === c.value
              ? "border-primary/40 bg-primary/15 text-primary"
              : selected
                ? "cursor-not-allowed border-border/20 bg-muted/20 text-muted-foreground/40"
                : "border-primary/20 bg-primary/[0.06] text-primary/80 hover:border-primary/40 hover:bg-primary/[0.12]",
          )}
          disabled={!!selected}
        >
          {c.label}
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
