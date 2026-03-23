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
  /** next-intl namespace that contains the "citationSources" key. Defaults to "copilot". */
  namespace?: "copilot" | "chat";
}

export function CitationFooter({ citations, namespace = "copilot" }: CitationFooterProps) {
  const t = useTranslations(namespace);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground/50 transition-colors hover:bg-muted/40 hover:text-muted-foreground/70"
      >
        <FileText size={10} />
        <span>{t("citationSources", { count: citations.length })}</span>
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
          {citations.map((c, i) => (
            <div
              key={c.chunk_id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/30"
            >
              <InlineCitationBadge index={i + 1} citation={c} />
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/60">
                {c.source_title}
              </span>
              {c.score != null && (
                <span className="text-[10px] tabular-nums text-muted-foreground/40">
                  {Math.round(c.score * 100)}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
