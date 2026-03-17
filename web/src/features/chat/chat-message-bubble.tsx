"use client";

/**
 * @file 对话消息气泡组件
 * @description 渲染单条对话消息，支持用户/AI 角色区分、Markdown 渲染、
 *              行内引用徽章、Agent 步骤展示、附件预览和反馈（赞/踩）功能。
 *              使用 React.memo 优化列表渲染性能。
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { m } from "framer-motion";
import {
  Copy,
  FileText,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { memo, useState } from "react";

import { BotAvatar } from "@/components/ui/bot-avatar";
import { cn } from "@/lib/utils";
import { InlineCitationBadge } from "@/features/copilot/inline-citation";
import { AgentSteps } from "@/features/copilot/agent-steps";
import { DeepResearchProgress } from "@/features/chat/deep-research-progress";
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
      return <h5 key={i} className="mb-1 text-xs font-semibold text-foreground/75">{processChildren(line.slice(6), citations)}</h5>;
    if (line.startsWith("#### "))
      return <h4 key={i} className="mb-1 text-xs font-semibold text-foreground/85">{processChildren(line.slice(5), citations)}</h4>;
    if (line.startsWith("### "))
      return <h3 key={i} className="mb-1 text-sm font-semibold text-foreground">{processChildren(line.slice(4), citations)}</h3>;
    if (line.startsWith("## "))
      return <h2 key={i} className="mb-1.5 text-sm font-bold text-foreground">{processChildren(line.slice(3), citations)}</h2>;
    if (line.startsWith("# "))
      return <h1 key={i} className="mb-2 text-base font-bold text-foreground">{processChildren(line.slice(2), citations)}</h1>;
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
  onCopy,
  onFeedback,
  onRegenerate,
  onFollowUp,
}: ChatMessageBubbleProps) {
  const t = useTranslations("chat");
  const stepsToShow = isLastAssistant && liveAgentSteps.length > 0 ? liveAgentSteps : msg.agentSteps;

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
          <BotAvatar className="h-6 w-6 flex-shrink-0 md:h-7 md:w-7" />
        )}
        <div className="min-w-0 max-w-[85%] md:max-w-[80%]">
          <div
            className={cn(
              "rounded-2xl px-3 py-2.5 md:px-4 md:py-3",
              msg.role === "user"
                ? "rounded-br-sm bg-primary text-white"
                : "rounded-bl-sm bg-muted/50 text-foreground"
            )}
          >
            {msg.role === "assistant" ? (
              msg.content === "" ? (
                <div className="flex items-center gap-1.5 py-0.5">
                  {[0, 1, 2].map((i) => (
                    <m.div
                      key={i}
                      animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                    />
                  ))}
                </div>
              ) : msg.content.includes("\n## ") ||
                msg.content.startsWith("## ") ||
                msg.content.includes("\n### ") ||
                msg.content.startsWith("### ") ? (
                <div className="text-sm leading-relaxed text-foreground/85">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="my-1.5">{processChildren(children, msg.citations)}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-foreground">{processChildren(children, msg.citations)}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
                      li: ({ children }) => <li className="my-0.5 leading-6">{processChildren(children, msg.citations)}</li>,
                      h1: ({ children }) => <h1 className="mb-2 mt-4 text-base font-bold text-foreground">{processChildren(children, msg.citations)}</h1>,
                      h2: ({ children }) => <h2 className="mb-2 mt-4 text-sm font-semibold text-foreground">{processChildren(children, msg.citations)}</h2>,
                      h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold text-foreground">{processChildren(children, msg.citations)}</h3>,
                      h4: ({ children }) => <h4 className="mb-1 mt-2 text-xs font-semibold text-foreground/85">{processChildren(children, msg.citations)}</h4>,
                      h5: ({ children }) => <h5 className="mb-1 mt-2 text-xs font-semibold text-foreground/75">{processChildren(children, msg.citations)}</h5>,
                      blockquote: ({ children }) => <blockquote className="my-1.5 border-l-2 border-primary/40 pl-3 text-foreground/70">{processChildren(children, msg.citations)}</blockquote>,
                      code: ({ children, ...props }) => {
                        const isInline = !("data-language" in props);
                        return isInline
                          ? <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-foreground/90">{children}</code>
                          : <code className="block">{children}</code>;
                      },
                      pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5">{children}</pre>,
                      a: ({ href, children }) => <a href={href} className="text-primary underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer">{children}</a>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <MarkdownContent content={msg.content} citations={msg.citations} />
              )
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
              <p className={cn("mt-1.5 text-[10px]", msg.role === "user" ? "text-white/50" : "text-muted-foreground/40")}>
                {formatTime(msg.timestamp, t)}
              </p>
            )}
          </div>

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
