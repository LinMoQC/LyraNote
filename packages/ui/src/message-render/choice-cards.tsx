"use client";

/**
 * @file 结构化选项卡片组件
 * @description 渲染 AI 生成的结构化可点选选项（如多选 prompt），
 *              选中后禁用其余选项并通过 onSelect 回调触发后续对话。
 */

import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "./utils";

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
const FLEXIBLE_CHOICES_REGEX = /```choices[^\n]*\n([\s\S]*?)\n```/i;
const INCOMPLETE_CHOICES_REGEX = /```choices[^\n]*\n[\s\S]*$/i;

function normalizeChoicesPayload(raw: string): string {
  return raw.trim().replace(/,\s*([}\]])/g, "$1");
}

function isChoiceArray(value: unknown): value is Choice[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) =>
      typeof item === "object"
      && item !== null
      && "label" in item
      && "value" in item
      && typeof item.label === "string"
      && typeof item.value === "string"
    );
}

function tryParseChoices(raw: string): Choice[] | null {
  const candidates = [raw, normalizeChoicesPayload(raw)];
  const trimmed = raw.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");

  if (start !== -1 && end > start) {
    const sliced = trimmed.slice(start, end + 1);
    candidates.push(sliced, normalizeChoicesPayload(sliced));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isChoiceArray(parsed)) return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

export function parseChoicesBlock(content: string): {
  textContent: string;
  choices: Choice[] | null;
} {
  const match = FLEXIBLE_CHOICES_REGEX.exec(content) ?? CHOICES_REGEX.exec(content);
  if (match) {
    const before = content.slice(0, match.index).trimEnd();
    const after = content.slice(match.index + match[0].length).trimStart();
    const textContent = [before, after].filter(Boolean).join("\n\n");
    return { textContent, choices: tryParseChoices(match[1]) };
  }

  const incompleteMatch = INCOMPLETE_CHOICES_REGEX.exec(content);
  if (incompleteMatch) {
    return {
      textContent: content.slice(0, incompleteMatch.index).trimEnd(),
      choices: null,
    };
  }

  return { textContent: content, choices: null };
}
