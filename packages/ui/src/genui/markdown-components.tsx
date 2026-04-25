"use client";

import { Fragment, useEffect, useCallback } from "react";
import type React from "react";
import { useTranslations } from "next-intl";
import type { CitationData } from "@lyranote/types";
import { processChildren } from "../message-render/citation-utils";
import { CodeBlock as SharedCodeBlock } from "../message-render/code-block";
import { MermaidBlock } from "../message-render";
import { ChartBlock } from "./chart-block";
import { TableBlock } from "./table-block";
import { CardBlock } from "./card-block";
import { FormulaBlock } from "./formula-block";
import { PaperCardBlock } from "./paper-card-block";
import { QuizBlock } from "./quiz-block";
import { TimelineBlock } from "./timeline-block";
import { StepsBlock } from "./steps-block";
import { DiffBlock } from "./diff-block";
import { MatrixBlock } from "./matrix-block";
import { KanbanBlock } from "./kanban-block";
import { GraphBlock } from "./graph-block";
import { WordCloudBlock } from "./wordcloud-block";
import { HeatmapBlock } from "./heatmap-block";
import { safeParseJSON, extractArtifactHtml } from "./utils";
import { GenUIStreamingPlaceholder } from "./genui-streaming-placeholder";

export interface ArtifactPayload {
  type: "html";
  content: string;
  title: string;
}

export interface MarkdownComponentsOpts {
  citations?: CitationData[];
  isMermaidStreaming?: boolean;
  isStreaming?: boolean;
  onArtifact?: (payload: ArtifactPayload) => void;
  CodeBlock?: React.ComponentType<{ code: string; language?: string }>;
}

interface GenUIPayload {
  type: string;
  props?: Record<string, unknown> | Array<Record<string, unknown>>;
  components?: GenUIPayload[];
  [key: string]: unknown;
}

/** Infer genui type from data shape when no explicit `type` field is present. */
function inferGenUIType(data: Record<string, unknown>): string | null {
  if ((data.columns || data.headers) && (data.rows || data.data)) return "table";
  if (data.chartType || data.xAxis || data.series) return "chart";
  if (data.xKey || data.yKey || data.yKeys) return "chart";
  if (Array.isArray(data.items)) return "card";
  if (typeof data.content === "string") return "text-card";
  if (Array.isArray(data.events) || Array.isArray(data.nodes)) return "timeline";
  if (Array.isArray(data.steps)) return "steps";
  return null;
}

function getGenUIProps(
  parsed: GenUIPayload,
): GenUIPayload["props"] | Record<string, unknown> | undefined {
  if (parsed.props !== undefined) return parsed.props;

  const {
    type: _type,
    components: _components,
    props: _props,
    ...rest
  } = parsed;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function renderGenUIComponent(
  parsed: GenUIPayload,
  opts: { onArtifact?: (p: ArtifactPayload) => void; isStreaming?: boolean },
): React.ReactNode {
  const { type } = parsed;
  const props = getGenUIProps(parsed);
  const code = JSON.stringify(props ?? {});
  const s = opts.isStreaming;

  switch (type) {
    case "chart":
      return <ChartBlock code={code} isStreaming={s} />;
    case "table":
      return <TableBlock code={code} isStreaming={s} />;
    case "card":
      return <CardBlock code={code} isStreaming={s} />;
    case "formula":
      return (
        <FormulaBlock
          code={
            typeof props === "object" && props !== null && !Array.isArray(props)
              ? String((props as Record<string, unknown>).content ?? "")
              : ""
          }
          isStreaming={s}
        />
      );
    case "paper-card":
      return <PaperCardBlock code={code} isStreaming={s} />;
    case "quiz":
      return <QuizBlock code={code} isStreaming={s} />;
    case "timeline":
      return <TimelineBlock code={code} isStreaming={s} />;
    case "steps":
      return <StepsBlock code={code} isStreaming={s} />;
    case "diff":
      return <DiffBlock code={code} isStreaming={s} />;
    case "matrix":
      return <MatrixBlock code={code} isStreaming={s} />;
    case "kanban":
      return <KanbanBlock code={code} isStreaming={s} />;
    case "graph":
      return <GraphBlock code={code} isStreaming={s} />;
    case "wordcloud":
      return <WordCloudBlock code={code} isStreaming={s} />;
    case "heatmap":
      return <HeatmapBlock code={code} isStreaming={s} />;
    case "text-card": {
      const p = (props && typeof props === "object" && !Array.isArray(props) ? props : {}) as Record<string, unknown>;
      const cardData = {
        title: String(p.title ?? ""),
        items: [{ label: "", value: String(p.content ?? "") }],
      };
      return <CardBlock code={JSON.stringify(cardData)} isStreaming={s} />;
    }
    case "artifact-html": {
      const content =
        typeof props === "object" && props !== null && !Array.isArray(props)
          ? String((props as Record<string, unknown>).content ?? "")
          : "";
      return <ArtifactCard content={content} onArtifact={opts.onArtifact} />;
    }
    case "group":
      return (
        <>
          {parsed.components?.map((c, i) => (
            <Fragment key={i}>{renderGenUIComponent(c, opts)}</Fragment>
          ))}
        </>
      );
    default:
      return null;
  }
}

function ArtifactCard({
  content,
  onArtifact,
}: {
  content: string;
  onArtifact?: (p: ArtifactPayload) => void;
}) {
  const t = useTranslations("genui");
  const open = useCallback(() => {
    onArtifact?.({ type: "html", content, title: t("artifactTitle") });
  }, [onArtifact, content, t]);

  useEffect(() => {
    open();
  }, [open]);

  return (
    <button
      type="button"
      onClick={open}
      className="my-3 flex w-full items-center gap-3 rounded-xl border border-indigo-500/25 bg-indigo-500/8 px-4 py-3 text-left transition-colors hover:bg-indigo-500/15"
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
        <svg
          className="h-4 w-4 text-indigo-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-indigo-300">
          {t("artifactTitle")}
        </div>
        <div className="mt-0.5 text-[10px] text-indigo-300/50">
          {t("artifactHint")}
        </div>
      </div>
      <svg
        className="h-4 w-4 flex-shrink-0 text-indigo-400/40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

function DefaultCodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  return <SharedCodeBlock code={code} language={language} />;
}

export function buildMarkdownComponents(opts: MarkdownComponentsOpts) {
  const {
    citations,
    isMermaidStreaming,
    isStreaming: isStreamingOpt,
    onArtifact,
    CodeBlock: ExternalCodeBlock,
  } = opts;
  const isStreaming = isStreamingOpt ?? isMermaidStreaming;
  const RenderCodeBlock = ExternalCodeBlock ?? DefaultCodeBlock;

  return {
    p: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p className="my-1.5">{processChildren(children, citations)}</p>
    ),
    strong: ({ children }: React.HTMLAttributes<HTMLElement>) => (
      <strong className="font-semibold text-foreground">
        {processChildren(children, citations)}
      </strong>
    ),
    em: ({ children }: React.HTMLAttributes<HTMLElement>) => (
      <em className="italic">{children}</em>
    ),
    ul: ({ children }: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>
    ),
    ol: ({ children }: React.HTMLAttributes<HTMLOListElement>) => (
      <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>
    ),
    li: ({ children }: React.HTMLAttributes<HTMLLIElement>) => (
      <li className="my-0.5 leading-6">
        {processChildren(children, citations)}
      </li>
    ),
    h1: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h1 className="mb-3 mt-6 text-xl font-bold text-foreground">
        {processChildren(children, citations)}
      </h1>
    ),
    h2: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2 className="mb-2.5 mt-5 text-lg font-bold text-foreground">
        {processChildren(children, citations)}
      </h2>
    ),
    h3: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3 className="mb-2 mt-4 text-base font-semibold text-foreground">
        {processChildren(children, citations)}
      </h3>
    ),
    h4: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h4 className="mb-1.5 mt-3 text-sm font-semibold text-foreground/90">
        {processChildren(children, citations)}
      </h4>
    ),
    h5: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h5 className="mb-1 mt-2.5 text-[13px] font-semibold text-foreground/80">
        {processChildren(children, citations)}
      </h5>
    ),
    blockquote: ({ children }: React.HTMLAttributes<HTMLElement>) => (
      <blockquote className="my-1.5 border-l-2 border-primary/40 pl-3 text-foreground/70">
        {processChildren(children, citations)}
      </blockquote>
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code: ({ children, className, ...props }: any) => {
      const isInline = !("data-language" in props) && !className;
      if (isInline)
        return (
          <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-foreground/90">
            {children}
          </code>
        );

      const text = String(children).replace(/\n$/, "");
      const lang = className ?? "";

      // Unified GenUI protocol dispatcher (priority)
      if (lang === "language-genui") {
        const parsed = safeParseJSON<GenUIPayload>(text);
        if (parsed?.type)
          return renderGenUIComponent(parsed, { onArtifact, isStreaming });

        // Auto-detect type from data shape when no explicit type field
        if (parsed && !parsed.type) {
          const inferred = inferGenUIType(parsed as unknown as Record<string, unknown>);
          if (inferred) {
            return renderGenUIComponent(
              { ...parsed, type: inferred } as GenUIPayload,
              { onArtifact, isStreaming },
            );
          }
        }

        // Fallback: artifact-html JSON often has escaping issues due to embedded HTML.
        // Try regex extraction before giving up.
        const artifactContent = extractArtifactHtml(text);
        if (artifactContent !== null)
          return (
            <ArtifactCard content={artifactContent} onArtifact={onArtifact} />
          );

        // During streaming, JSON is incomplete — show placeholder instead of raw source
        if (isStreaming) return <GenUIStreamingPlaceholder />;

        return <RenderCodeBlock code={text} language="json" />;
      }

      // Backward-compatible: individual language-xxx blocks
      if (lang === "language-chart")
        return <ChartBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-table")
        return <TableBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-card")
        return <CardBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-formula")
        return <FormulaBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-paper-card")
        return <PaperCardBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-quiz")
        return <QuizBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-timeline")
        return <TimelineBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-steps")
        return <StepsBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-diff")
        return <DiffBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-matrix")
        return <MatrixBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-kanban")
        return <KanbanBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-graph")
        return <GraphBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-wordcloud")
        return <WordCloudBlock code={text} isStreaming={isStreaming} />;
      if (lang === "language-heatmap")
        return <HeatmapBlock code={text} isStreaming={isStreaming} />;

      // Artifact
      if (lang === "language-artifact-html") {
        return <ArtifactCard content={text} onArtifact={onArtifact} />;
      }

      // Existing
      if (lang === "language-mermaid")
        return <MermaidBlock code={text} isStreaming={isMermaidStreaming} />;
      if (lang === "language-choices") return null;

      // Fallback: json blocks that look like GenUI data
      if (lang === "language-json") {
        const jsonParsed = safeParseJSON<Record<string, unknown>>(text);
        if (jsonParsed && !Array.isArray(jsonParsed)) {
          if (
            (jsonParsed.columns || jsonParsed.headers) &&
            (jsonParsed.rows || jsonParsed.data)
          ) {
            return <TableBlock code={text} isStreaming={isStreaming} />;
          }
          if (jsonParsed.type && typeof jsonParsed.type === "string") {
            return renderGenUIComponent(jsonParsed as unknown as GenUIPayload, {
              onArtifact,
              isStreaming,
            });
          }
        }
      }

      return <RenderCodeBlock code={text} language={className} />;
    },
    pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => (
      <>{children}</>
    ),
    table: ({ children }: React.HTMLAttributes<HTMLTableElement>) => (
      <div className="my-3 overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }: React.HTMLAttributes<HTMLTableSectionElement>) => (
      <thead className="bg-white/[0.04]">{children}</thead>
    ),
    tbody: ({ children }: React.HTMLAttributes<HTMLTableSectionElement>) => (
      <tbody className="divide-y divide-white/[0.06]">{children}</tbody>
    ),
    tr: ({ children }: React.HTMLAttributes<HTMLTableRowElement>) => (
      <tr className="transition-colors hover:bg-white/[0.02]">{children}</tr>
    ),
    th: ({ children }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <th className="px-3 py-2 text-left text-xs font-semibold text-foreground/70">
        {children}
      </th>
    ),
    td: ({ children }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <td className="px-3 py-2 text-foreground/80">{children}</td>
    ),
    a: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a
        href={href}
        className="text-primary underline underline-offset-2 hover:opacity-80"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
  };
}
