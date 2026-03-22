"use client";

/**
 * @file 对话消息气泡组件
 * @description 渲染单条对话消息，支持用户/AI 角色区分、Markdown 渲染、
 *              行内引用徽章、Agent 步骤展示、附件预览和反馈（赞/踩）功能。
 *              使用 React.memo 优化列表渲染性能。
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, m } from "framer-motion";
import {
  Check,
  Copy,
  FileText,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { memo, useMemo, useState } from "react";

import { BotAvatar } from "@/components/ui/bot-avatar";
import { cn } from "@/lib/utils";
import { InlineCitationBadge } from "@/features/copilot/inline-citation";
import { AgentSteps } from "@/features/copilot/agent-steps";
import { DeepResearchProgress } from "@/features/chat/deep-research-progress";
import { ChoiceCards, parseChoicesBlock } from "@/features/chat/choice-cards";
import { MermaidBlock } from "@/features/chat/mermaid-block";
import type { CitationData } from "@/types";
import type { AgentEvent } from "@/services/ai-service";
import type { FeedbackRating } from "@/services/feedback-service";
import type { LocalMessage, MessageAttachment } from "./chat-types";
import { formatTime, isServerMessageId, parseBold, processChildren } from "./chat-helpers";

function AttachmentImage({ att }: { att: MessageAttachment }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white/80">
        <FileText size={12} />
        <span className="max-w-[120px] truncate">{att.name}</span>
      </span>
    );
  }

  return (
    <span className="relative inline-block">
      {!loaded && (
        <span className="flex h-32 w-32 items-center justify-center rounded-lg border border-white/20 bg-white/5">
          <m.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white/70"
          />
        </span>
      )}
      <Image
        src={att.previewUrl!}
        alt={att.name}
        width={200}
        height={160}
        unoptimized
        className={cn(
          "max-h-40 max-w-[200px] rounded-lg border border-white/20 object-cover",
          loaded ? "block" : "absolute left-0 top-0 opacity-0",
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </span>
  );
}

// ── MarkdownContent ───────────────────────────────────────────────────────────

function MarkdownContent({ content, citations }: { content: string; citations?: CitationData[] }) {
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

// ── CodeBlock ────────────────────────────────────────────────────────────────

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lang = language?.replace(/^language-/, "") ?? "";

  return (
    <div className="group/code my-3 overflow-hidden rounded-lg bg-[#1a1b26] shadow-lg ring-1 ring-white/[0.08]">
      <div className="flex items-center gap-2 bg-[#15161e] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        {lang && (
          <span className="ml-1 text-[11px] font-medium text-white/30">
            {lang}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-all",
            copied
              ? "text-emerald-400"
              : "text-white/25 opacity-0 hover:bg-white/5 hover:text-white/50 group-hover/code:opacity-100"
          )}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6 text-[#c0caf5]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── MermaidBlock ──────────────────────────────────────────────────────────────
// Imported from shared mermaid-block.tsx

// ── ReasoningBlock (Gemini-style) ────────────────────────────────────────────

function ThinkingSparkle({ streaming }: { streaming?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn(
        "flex-shrink-0",
        streaming ? "animate-pulse text-blue-400" : "text-blue-400/70"
      )}
    >
      <path d="M8 0L9.2 5.3L14 4L10.5 7.5L16 8L10.5 8.5L14 12L9.2 10.7L8 16L6.8 10.7L2 12L5.5 8.5L0 8L5.5 7.5L2 4L6.8 5.3Z" />
    </svg>
  );
}

function ReasoningBlock({ content, streaming }: { content: string; streaming?: boolean }) {
  const t = useTranslations("chat");
  const [expanded, setExpanded] = useState(false);
  const [userToggled, setUserToggled] = useState(false);

  const isOpen = userToggled ? expanded : (streaming || expanded);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => { setExpanded((o) => !o); setUserToggled(true); }}
        className="group flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground/80 transition-colors hover:text-foreground"
      >
        <ThinkingSparkle streaming={streaming} />
        <span className="font-medium">
          {streaming ? t("thinkingInProgress") : t("reasoning")}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={cn(
            "text-muted-foreground/50 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        >
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="max-h-72 overflow-y-auto border-l-2 border-muted-foreground/15 pl-4 pt-1">
              <div className="whitespace-pre-wrap text-[13px] italic leading-relaxed text-muted-foreground/60">
                {content}
                {streaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-blue-400/50" />}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ChatCitationFooter ────────────────────────────────────────────────────────

function ChatCitationFooter({ citations }: { citations: CitationData[] }) {
  const t = useTranslations("chat");
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

// ── ChatMessageBubble ─────────────────────────────────────────────────────────

export interface ChatMessageBubbleProps {
  msg: LocalMessage;
  isLastAssistant: boolean;
  streaming: boolean;
  liveAgentSteps: AgentEvent[];
  feedbackRating?: FeedbackRating;
  copied: boolean;
  avatarUrl: string | null;
  initials: string;
  showReasoning?: boolean;
  onCopy: (text: string) => void;
  onFeedback: (msgId: string, rating: FeedbackRating) => void;
  onRegenerate: () => void;
  onFollowUp: (q: string) => void;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  msg,
  isLastAssistant,
  streaming,
  liveAgentSteps,
  feedbackRating,
  copied,
  avatarUrl,
  initials,
  showReasoning = true,
  onCopy,
  onFeedback,
  onRegenerate,
  onFollowUp,
}: ChatMessageBubbleProps) {
  const t = useTranslations("chat");
  const stepsToShow = isLastAssistant && liveAgentSteps.length > 0 ? liveAgentSteps : msg.agentSteps;

  const isMermaidStreaming = isLastAssistant && streaming;
  const mdComponents = useMemo(() => ({
    p: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) => <p className="my-1.5">{processChildren(children, msg.citations)}</p>,
    strong: ({ children }: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold text-foreground">{processChildren(children, msg.citations)}</strong>,
    em: ({ children }: React.HTMLAttributes<HTMLElement>) => <em className="italic">{children}</em>,
    ul: ({ children }: React.HTMLAttributes<HTMLUListElement>) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
    ol: ({ children }: React.HTMLAttributes<HTMLOListElement>) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
    li: ({ children }: React.HTMLAttributes<HTMLLIElement>) => <li className="my-0.5 leading-6">{processChildren(children, msg.citations)}</li>,
    h1: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="mb-3 mt-6 text-xl font-bold text-foreground">{processChildren(children, msg.citations)}</h1>,
    h2: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="mb-2.5 mt-5 text-lg font-bold text-foreground">{processChildren(children, msg.citations)}</h2>,
    h3: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="mb-2 mt-4 text-base font-semibold text-foreground">{processChildren(children, msg.citations)}</h3>,
    h4: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-foreground/90">{processChildren(children, msg.citations)}</h4>,
    h5: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h5 className="mb-1 mt-2.5 text-[13px] font-semibold text-foreground/80">{processChildren(children, msg.citations)}</h5>,
    blockquote: ({ children }: React.HTMLAttributes<HTMLElement>) => <blockquote className="my-1.5 border-l-2 border-primary/40 pl-3 text-foreground/70">{processChildren(children, msg.citations)}</blockquote>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code: ({ children, className, ...props }: any) => {
      const isInline = !("data-language" in props) && !className;
      if (isInline) return <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-foreground/90">{children}</code>;
      const text = String(children).replace(/\n$/, "");
      if (className === "language-mermaid") return <MermaidBlock code={text} isStreaming={isMermaidStreaming} />;
      return <CodeBlock code={text} language={className} />;
    },
    pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => <>{children}</>,
    table: ({ children }: React.HTMLAttributes<HTMLTableElement>) => (
      <div className="my-3 overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="bg-white/[0.04]">{children}</thead>,
    tbody: ({ children }: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y divide-white/[0.06]">{children}</tbody>,
    tr: ({ children }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className="transition-colors hover:bg-white/[0.02]">{children}</tr>,
    th: ({ children }: React.HTMLAttributes<HTMLTableCellElement>) => <th className="px-3 py-2 text-left text-xs font-semibold text-foreground/70">{children}</th>,
    td: ({ children }: React.HTMLAttributes<HTMLTableCellElement>) => <td className="px-3 py-2 text-foreground/80">{children}</td>,
    a: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} className="text-primary underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer">{children}</a>,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [msg.citations, isMermaidStreaming]);

  return (
    <m.div
      key={msg.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      {msg.role === "assistant" && msg.deepResearch && (
        <div className="mb-3">
          <DeepResearchProgress
            progress={msg.deepResearch.status === "done" ? msg.deepResearch : { ...msg.deepResearch, reportTokens: "" }}
            onFollowUp={(q) => onFollowUp(q)}
            onCopy={(text) => onCopy(text)}
          />
        </div>
      )}

      {msg.role === "assistant" && !msg.deepResearch && stepsToShow?.length ? (
        <AgentSteps
          steps={stepsToShow}
          isStreaming={isLastAssistant && streaming}
          defaultOpen={(isLastAssistant && streaming) || undefined}
          className="mb-4"
        />
      ) : null}

      {/* For completed deep research, the document card is already shown above -- skip the chat bubble content */}
      {!(msg.role === "assistant" && msg.deepResearch?.status === "done" && msg.deepResearch.reportTokens) && (
      <div className={cn("flex gap-2 md:gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
        {msg.role === "assistant" && (
          isLastAssistant && msg.content === "" ? (
            <div className="relative h-8 w-8 shrink-0">
              <div
                className="absolute inset-0 spin-ease rounded-full"
                style={{ background: "conic-gradient(from 0deg, #a78bfa, #818cf8, #60a5fa, transparent 55%)" }}
              />
              <div className="absolute inset-[2.5px] overflow-hidden rounded-full">
                <BotAvatar className="h-full w-full" />
              </div>
            </div>
          ) : (
            <BotAvatar className="h-6 w-6 flex-shrink-0 md:h-7 md:w-7" />
          )
        )}
        <div className="min-w-0 max-w-[85%] md:max-w-[80%]">
          {msg.role === "assistant" && msg.reasoning && showReasoning && (
            <ReasoningBlock
              content={msg.reasoning}
              streaming={isLastAssistant && streaming}
            />
          )}
          {(msg.role === "user" || msg.content !== "") && (
          <div
            className={cn(
              "rounded-2xl px-3 py-2.5 md:px-4 md:py-3",
              msg.role === "user"
                ? "rounded-br-sm bg-primary text-white selection:bg-white/30 selection:text-white"
                : "rounded-bl-sm bg-muted/50 text-foreground"
            )}
          >
            {msg.role === "assistant" ? (
              (() => {
                const { textBefore, choices } = parseChoicesBlock(msg.content);
                const displayContent = choices ? textBefore : msg.content;
                const useReactMarkdown = displayContent.includes("\n## ") || displayContent.startsWith("## ") ||
                  displayContent.includes("\n### ") || displayContent.startsWith("### ") ||
                  displayContent.includes("```") ||
                  /\|.+\|/.test(displayContent);
                return (
                  <>
                    {useReactMarkdown ? (
                      <div className="text-sm leading-relaxed text-foreground/85">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={mdComponents}
                        >
                          {displayContent}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <MarkdownContent content={displayContent} citations={msg.citations} />
                    )}
                    {choices && <ChoiceCards choices={choices} onSelect={onFollowUp} />}
                  </>
                );
              })()
            ) : (
              <p className="text-sm leading-relaxed">{msg.content}</p>
            )}
            {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {msg.attachments.map((att) =>
                  att.type.startsWith("image/") && att.previewUrl ? (
                    <AttachmentImage key={att.name} att={att} />
                  ) : (
                    <span
                      key={att.name}
                      className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white/80"
                    >
                      <FileText size={12} />
                      <span className="max-w-[120px] truncate">{att.name}</span>
                    </span>
                  ),
                )}
              </div>
            )}
            {msg.content !== "" && (
              <p className={cn("mt-1.5 flex items-center gap-2 text-[10px]", msg.role === "user" ? "text-white/50 justify-end" : "text-muted-foreground/40 justify-between")}>
                <span>{formatTime(msg.timestamp, t)}</span>
                {msg.role === "assistant" && msg.speed && !(isLastAssistant && streaming) && (() => {
                  const totalSec = (msg.speed.ttft_ms + (msg.speed.tokens / (msg.speed.tps || 1)) * 1000) / 1000;
                  const label = totalSec >= 1 ? `${totalSec.toFixed(1)}s` : `${msg.speed.ttft_ms}ms`;
                  return (
                    <span
                      className="tabular-nums"
                      title={`TTFT ${msg.speed.ttft_ms}ms · ${msg.speed.tps} tok/s · ${msg.speed.tokens} tokens`}
                    >
                      用时 {label}
                    </span>
                  );
                })()}
              </p>
            )}
          </div>
          )}

          {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
            <ChatCitationFooter citations={msg.citations} />
          )}

          {msg.role === "assistant" && msg.content !== "" && !(isLastAssistant && streaming) && (
            <div className="mt-2 flex items-center gap-1 text-muted-foreground/60">
              <button
                type="button"
                onClick={() => onCopy(msg.content)}
                className="rounded-md p-1.5 transition-colors hover:bg-accent"
                title={copied ? t("copied") : t("copy")}
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                onClick={() => onFeedback(msg.id, "like")}
                disabled={!isServerMessageId(msg.id)}
                className={cn(
                  "rounded-md p-1.5 transition-colors hover:bg-accent",
                  feedbackRating === "like" && "bg-accent text-foreground",
                  !isServerMessageId(msg.id) && "cursor-not-allowed opacity-40"
                )}
                title={t("like")}
              >
                <ThumbsUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => onFeedback(msg.id, "dislike")}
                disabled={!isServerMessageId(msg.id)}
                className={cn(
                  "rounded-md p-1.5 transition-colors hover:bg-accent",
                  feedbackRating === "dislike" && "bg-accent text-foreground",
                  !isServerMessageId(msg.id) && "cursor-not-allowed opacity-40"
                )}
                title={t("dislike")}
              >
                <ThumbsDown size={14} />
              </button>
              {isLastAssistant && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={streaming}
                  className="rounded-md p-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  title={t("regenerate")}
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        {msg.role === "user" && (
          <div className="relative flex h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={initials}
                width={28}
                height={28}
                unoptimized
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : null}
            <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white ${avatarUrl ? "hidden" : ""}`}>
              {initials}
            </span>
          </div>
        )}
      </div>
      )}
    </m.div>
  );
});
