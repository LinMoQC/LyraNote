"use client";
import { FileText, Globe, MessageCircle, CornerDownRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { WritingContextChunk } from "@/store/use-proactive-store";
import type { CrossNotebookChunk } from "@/services/ai-service";

export function RelevantSourcesView({
  localChunks = [],
  globalChunks = [],
  onAskAbout,
  onInsertCitation,
}: {
  localChunks?: WritingContextChunk[];
  globalChunks?: CrossNotebookChunk[];
  onAskAbout?: (excerpt: string) => void;
  onInsertCitation?: (text: string) => void;
}) {
  const t = useTranslations("copilot");
  const totalCount = localChunks.length + globalChunks.length;
  if (totalCount === 0) return null;

  return (
    <div className="border-b border-white/[0.06]">
      <div className="space-y-4 px-4 pb-4 pt-1">
        {/* Local Note chunks */}
        {localChunks.length > 0 && (
          <div className="space-y-1.5">
            <div className="mb-2 mt-2 flex items-center gap-1.5 px-1">
              <FileText size={11} className="text-muted-foreground/50" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                {t("relevantSources", { count: localChunks.length })}
              </span>
            </div>
            {localChunks.map((chunk) => (
              <SourceCard
                key={chunk.chunk_id}
                title={chunk.source_title}
                excerpt={chunk.excerpt}
                score={chunk.score}
                onInsert={() => onInsertCitation?.(chunk.excerpt.slice(0, 200))}
                onAsk={() => onAskAbout?.(`关于「${chunk.source_title}」中提到的：${chunk.excerpt.slice(0, 100)}…请帮我分析一下`)}
                t={t}
              />
            ))}
          </div>
        )}

        {/* Global chunks */}
        {globalChunks.length > 0 && (
          <div className="space-y-1.5">
            <div className="mb-2 flex items-center gap-1.5 px-1 pt-1 opacity-80">
              <Globe size={11} className="text-muted-foreground/50" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                {t("globalKnowledge")} ({globalChunks.length})
              </span>
            </div>
            {globalChunks.map((chunk) => (
              <SourceCard
                key={chunk.chunk_id}
                title={`${chunk.notebook_title} → ${chunk.source_title}`}
                excerpt={chunk.excerpt}
                score={chunk.score}
                onInsert={() => onInsertCitation?.(chunk.excerpt.slice(0, 200))}
                onAsk={() => onAskAbout?.(`关于全局资料「${chunk.source_title}」中提到的：${chunk.excerpt.slice(0, 100)}…请帮我结合当前内容分析一下`)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({
  title,
  excerpt,
  score,
  onInsert,
  onAsk,
  t,
}: {
  title: string;
  excerpt: string;
  score?: number;
  onInsert: () => void;
  onAsk: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  return (
    <div className="group relative rounded-[10px] border border-white/[0.04] bg-white/[0.02] p-2.5 transition-all hover:border-white/[0.08] hover:bg-white/[0.04]">
      {/* 标题栏 */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-[11px] font-medium text-foreground/80">
          {title}
        </p>
        {score !== undefined && (
          <span className="flex-shrink-0 rounded-[4px] bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary/70">
            {Math.round(score * 100)}%
          </span>
        )}
      </div>

      {/* 摘要正文 */}
      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">
        {excerpt}
      </p>

      {/* Hover Action Bar */}
      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {onInsert && (
          <button
            type="button"
            onClick={onInsert}
            className="flex h-6 items-center gap-1 rounded bg-black/40 px-2 text-[10px] text-white/70 backdrop-blur-md transition-colors hover:bg-violet-500/20 hover:text-violet-300"
            title={t("insertCitation")}
          >
            <CornerDownRight size={10} />
            {t("insertCitation")}
          </button>
        )}
        {onAsk && (
          <button
            type="button"
            onClick={onAsk}
            className="flex h-6 items-center gap-1 rounded bg-black/40 px-2 text-[10px] text-white/70 backdrop-blur-md transition-colors hover:bg-violet-500/20 hover:text-violet-300"
            title={t("askAbout")}
          >
            <MessageCircle size={10} />
            {t("askAbout")}
          </button>
        )}
      </div>
    </div>
  );
}
