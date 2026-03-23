"use client";

/**
 * @file 轻量 Markdown 行解析器
 * @description 逐行解析常见 Markdown 语法（标题、加粗、列表），
 *              无需完整 ReactMarkdown，适合短文本消息渲染。
 */

import type { CitationData } from "@/types";
import { parseBold, processChildren } from "@/features/chat/chat-helpers";

export function MarkdownContent({ content, citations }: { content: string; citations?: CitationData[] }) {
  const rendered = content.split("\n").map((line, i) => {
    if (line.startsWith("##### "))
      return <h5 key={i} className="mb-1 mt-2.5 text-[13px] font-semibold text-foreground/80">{processChildren(line.slice(6), citations)}</h5>;
    if (line.startsWith("#### "))
      return <h4 key={i} className="mb-1.5 mt-3 text-sm font-semibold text-foreground/90">{processChildren(line.slice(5), citations)}</h4>;
    if (line.startsWith("### "))
      return <h3 key={i} className="mb-2 mt-4 text-base font-semibold text-foreground">{processChildren(line.slice(4), citations)}</h3>;
    if (line.startsWith("## "))
      return <h2 key={i} className="mb-2.5 mt-5 text-lg font-bold text-foreground">{processChildren(line.slice(3), citations)}</h2>;
    if (line.startsWith("# "))
      return <h1 key={i} className="mb-3 mt-6 text-xl font-bold text-foreground">{processChildren(line.slice(2), citations)}</h1>;
    if (line.startsWith("**") && line.endsWith("**") && !line.slice(2, -2).includes("**"))
      return <p key={i} className="mb-1 font-semibold text-foreground">{processChildren(line.slice(2, -2), citations)}</p>;
    if (line.startsWith("- ")) {
      const text = line.slice(2);
      return <li key={i} className="ml-4 list-disc">{processChildren(parseBold(text), citations)}</li>;
    }
    if (line.match(/^\d+\. /)) {
      const text = line.replace(/^\d+\. /, "");
      return <li key={i} className="ml-4 list-decimal">{processChildren(parseBold(text), citations)}</li>;
    }
    if (line === "") return <div key={i} className="h-2" />;
    return <p key={i} className="mb-1">{processChildren(parseBold(line), citations)}</p>;
  });
  return <div className="space-y-0.5 text-sm leading-relaxed">{rendered}</div>;
}
