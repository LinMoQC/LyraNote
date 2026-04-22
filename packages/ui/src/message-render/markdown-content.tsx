"use client";

/**
 * @file 轻量 Markdown 行解析器
 * @description 逐行解析常见 Markdown 语法（标题、加粗、列表），
 *              无需完整 ReactMarkdown，适合短文本消息渲染。
 */

import type { ReactNode } from "react";

import type { CitationData } from "@lyranote/types";

import { processChildren } from "./citation-utils";

function parseBold(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  const re = /\*\*(.+?)\*\*/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    parts.push(<strong key={match.index} className="font-semibold text-foreground">{match[1]}</strong>);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 1 ? parts : parts[0] ?? text;
}

function StreamingCaret() {
  return <span className="streaming-caret" aria-hidden="true" />;
}

export function MarkdownContent({ content, citations, showCursor }: { content: string; citations?: CitationData[]; showCursor?: boolean }) {
  const lines = content.split("\n");

  // Find the last non-empty line index for cursor placement
  let lastContentIdx = -1;
  if (showCursor) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() !== "") {
        lastContentIdx = i;
        break;
      }
    }
  }

  const rendered = lines.map((line, i) => {
    const cursor = i === lastContentIdx ? <StreamingCaret /> : null;

    if (line.startsWith("##### "))
      return <h5 key={i} className="mb-1 mt-2.5 text-[13px] font-semibold text-foreground/80">{processChildren(line.slice(6), citations)}{cursor}</h5>;
    if (line.startsWith("#### "))
      return <h4 key={i} className="mb-1.5 mt-3 text-sm font-semibold text-foreground/90">{processChildren(line.slice(5), citations)}{cursor}</h4>;
    if (line.startsWith("### "))
      return <h3 key={i} className="mb-2 mt-4 text-base font-semibold text-foreground">{processChildren(line.slice(4), citations)}{cursor}</h3>;
    if (line.startsWith("## "))
      return <h2 key={i} className="mb-2.5 mt-5 text-lg font-bold text-foreground">{processChildren(line.slice(3), citations)}{cursor}</h2>;
    if (line.startsWith("# "))
      return <h1 key={i} className="mb-3 mt-6 text-xl font-bold text-foreground">{processChildren(line.slice(2), citations)}{cursor}</h1>;
    if (line.startsWith("**") && line.endsWith("**") && !line.slice(2, -2).includes("**"))
      return <p key={i} className="mb-1 font-semibold text-foreground">{processChildren(line.slice(2, -2), citations)}{cursor}</p>;
    if (line.startsWith("- ")) {
      const text = line.slice(2);
      return <li key={i} className="ml-4 list-disc">{processChildren(parseBold(text), citations)}{cursor}</li>;
    }
    if (line.match(/^\d+\. /)) {
      const text = line.replace(/^\d+\. /, "");
      return <li key={i} className="ml-4 list-decimal">{processChildren(parseBold(text), citations)}{cursor}</li>;
    }
    if (line === "") return <div key={i} className="h-2" />;
    return <p key={i} className="mb-1">{processChildren(parseBold(line), citations)}{cursor}</p>;
  });
  return <div className="space-y-0.5 text-sm leading-relaxed">{rendered}</div>;
}
