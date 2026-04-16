/**
 * @file 来源卡片组件
 * @description 渲染 AI 回复中的结构化来源引用卡片（文档来源 SourceCard 和网页来源 WebCard）。
 */

import { ExternalLink, FileText } from "lucide-react";

export function SourceCard({ data }: { data: Record<string, unknown> }) {
  const title = String(data.title ?? "");
  const excerpt = String(data.excerpt ?? "");
  const score = typeof data.score === "number" ? data.score : null;
  return (
    <div className="flex w-52 shrink-0 flex-col gap-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-start gap-1.5">
        <FileText size={12} className="mt-0.5 shrink-0 text-muted-foreground/50" />
        <span className="line-clamp-2 text-[12px] font-medium leading-snug text-foreground/80">{title}</span>
      </div>
      {excerpt && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">{excerpt}</p>
      )}
      {score !== null && (
        <span className="mt-auto self-end text-[10px] tabular-nums text-muted-foreground/40">
          {Math.round(score * 100)}%
        </span>
      )}
    </div>
  );
}

export function WebCard({ data }: { data: Record<string, unknown> }) {
  const title = String(data.title ?? "");
  const url = String(data.url ?? "");
  const snippet = String(data.snippet ?? "");
  const domain = url
    ? (() => { try { return new URL(url).hostname; } catch { return url; } })()
    : "";
  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-52 shrink-0 flex-col gap-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06]"
    >
      <div className="flex items-center gap-1.5">
        <ExternalLink size={11} className="shrink-0 text-muted-foreground/40" />
        <span className="truncate text-[10px] text-muted-foreground/40">{domain}</span>
      </div>
      <span className="line-clamp-2 text-[12px] font-medium leading-snug text-foreground/80">{title}</span>
      {snippet && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">{snippet}</p>
      )}
    </a>
  );
}
