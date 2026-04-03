"use client";

/**
 * @file 消息引用来源底部组件
 * @description 在 AI 消息底部展示可展开的引用来源列表，
 *              包含来源标题、摘要和内联引用徽章。chat 与 copilot 共用，
 *              通过 namespace prop 区分 i18n 命名空间。
 */

import { FileText } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { InlineCitationBadge } from "./inline-citation";
import type { CitationData } from "@/types";

interface CitationFooterProps {
  citations: CitationData[];
  /** Message content used to filter footer to only referenced citations ([来源N]). */
  content?: string;
  /** next-intl namespace that contains the "citationSources" key. Defaults to "copilot". */
  namespace?: "copilot" | "chat";
}

function buildCitationKeys(citations: CitationData[]) {
  const seen = new Map<string, number>();

  return citations.map((citation) => {
    const baseKey =
      [citation.chunk_id, citation.source_id, citation.source_title]
        .filter((value) => Boolean(value && value.trim().length > 0))
        .join("::") || "citation";

    const occurrence = seen.get(baseKey) ?? 0;
    seen.set(baseKey, occurrence + 1);

    return occurrence === 0 ? baseKey : `${baseKey}::${occurrence}`;
  });
}

/** Parse [来源N] references from message content → 1-based index set. */
function parseReferencedIndices(content: string): Set<number> {
  const indices = new Set<number>();
  for (const m of content.matchAll(/\[来源(\d+)\]/g)) {
    const n = parseInt(m[1], 10);
    if (n > 0) indices.add(n);
  }
  return indices;
}

export function CitationFooter({ citations, content, namespace = "copilot" }: CitationFooterProps) {
  const t = useTranslations(namespace);
  const [expanded, setExpanded] = useState(false);

  // Only show citations that are actually referenced in the response text.
  // Falls back to showing all if content is not provided or has no [来源N] refs.
  const referencedIndices = content ? parseReferencedIndices(content) : null;
  const visibleEntries: Array<{ index: number; citation: CitationData }> =
    referencedIndices && referencedIndices.size > 0
      ? citations
          .map((c, i) => ({ index: i + 1, citation: c }))
          .filter(({ index }) => referencedIndices.has(index))
      : citations.map((c, i) => ({ index: i + 1, citation: c }));

  if (visibleEntries.length === 0) return null;

  const citationKeys = buildCitationKeys(visibleEntries.map((e) => e.citation));

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground/50 transition-colors hover:bg-muted/40 hover:text-muted-foreground/70"
      >
        <FileText size={10} />
        <span>{t("citationSources", { count: visibleEntries.length })}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5 pl-1">
          {visibleEntries.map(({ index, citation }, i) => (
            <div
              key={citationKeys[i]}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/30"
            >
              <InlineCitationBadge index={index} citation={citation} />
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/60">
                {citation.source_title}
              </span>
              {citation.score != null && (
                <span className="text-[10px] tabular-nums text-muted-foreground/40">
                  {Math.round(citation.score * 100)}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
