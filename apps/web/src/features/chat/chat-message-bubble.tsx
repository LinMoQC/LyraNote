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
import { Check, Copy, FileText, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

import { BotAvatar } from "@/components/ui/bot-avatar";
import { cn } from "@/lib/utils";
import { CitationFooter } from "@/components/message-render/citation-footer";
import { MCPHTMLView, MCPResultCard } from "@/components/message-render/mcp-result-views";
import { AgentSteps } from "@/components/message-render/agent-steps";
import { MindMapView } from "@/components/message-render/mind-map-view";
import { DiagramView } from "@/components/message-render/diagram-view";
import { ExcalidrawView } from "@/components/message-render/excalidraw-view";
import { DeepResearchProgress } from "@/components/deep-research/deep-research-progress";
import { ChoiceCards } from "@/components/message-render/choice-cards";
import { parseMessageContent } from "@/components/message-render/parse-message-content";
import { AttachmentImage } from "@/components/message-render/attachment-image";
import { MarkdownContent } from "@/components/message-render/markdown-content";
import { CodeBlock } from "@/components/message-render/code-block";
import { ReasoningBlock } from "@/components/message-render/reasoning-block";
import { SourceCard, WebCard } from "@/components/message-render/source-cards";
import { buildMarkdownComponents } from "@/components/genui";
import type { AgentEvent } from "@/services/ai-service";
import type { FeedbackRating } from "@/services/feedback-service";
import type { LocalMessage } from "./chat-types";
import { formatTime, isServerMessageId } from "./chat-helpers";

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
  onArtifact?: (payload: { type: "html"; content: string; title: string }) => void;
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
  onArtifact,
}: ChatMessageBubbleProps) {
  const t = useTranslations("chat");

  const stepsToShow = isLastAssistant && liveAgentSteps.length > 0 ? liveAgentSteps : msg.agentSteps;
  const isStreaming = isLastAssistant && streaming;
  const isSpinning = isLastAssistant && msg.content === "";
  const hasDeepResearchDone =
    msg.role === "assistant" &&
    msg.deepResearch?.status === "done" &&
    !!msg.deepResearch.reportTokens;
  const showBubble = msg.role === "user" || msg.content !== "";

  const { textContent, choices, needsRichMarkdown } = useMemo(
    () => parseMessageContent(msg.content),
    [msg.content],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mdComponents = useMemo(() => buildMarkdownComponents({
    citations: msg.citations,
    isMermaidStreaming: isStreaming,
    CodeBlock,
    onArtifact,
  }), [msg.citations, isStreaming, onArtifact]);

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
          isStreaming={isStreaming}
          defaultOpen={isStreaming || undefined}
          className="mb-4"
        />
      ) : null}

      {!hasDeepResearchDone && (
        <div className={cn("flex gap-2 md:gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
          {msg.role === "assistant" && (
            <BotAvatar
              spinning={isSpinning}
              className={isSpinning ? undefined : "h-6 w-6 flex-shrink-0 md:h-7 md:w-7"}
            />
          )}
          <div className="min-w-0 max-w-[85%] md:max-w-[80%]">
            {msg.role === "assistant" && msg.reasoning && showReasoning && (
              <ReasoningBlock content={msg.reasoning} streaming={isStreaming} />
            )}
            {showBubble && (
              <div
                className={cn(
                  "rounded-2xl px-3 py-2.5 md:px-4 md:py-3",
                  msg.role === "user"
                    ? "rounded-br-sm bg-primary text-white selection:bg-white/30 selection:text-white"
                    : "rounded-bl-sm bg-muted/50 text-foreground",
                )}
              >
                {msg.role === "assistant" ? (
                  <>
                    {needsRichMarkdown ? (
                      <div className="text-sm leading-relaxed text-foreground/85">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                          {textContent}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <MarkdownContent content={textContent} citations={msg.citations} />
                    )}
                    {choices && <ChoiceCards choices={choices} onSelect={onFollowUp} />}
                  </>
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
                    {msg.role === "assistant" && msg.speed && !isStreaming && (() => {
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
              <CitationFooter citations={msg.citations} namespace="chat" />
            )}

            {msg.role === "assistant" && msg.uiElements && msg.uiElements.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {msg.uiElements.map((el, i) =>
                  el.element_type === "source-card" ? <SourceCard key={i} data={el.data} />
                  : el.element_type === "web-card"   ? <WebCard key={i} data={el.data} />
                  : null,
                )}
              </div>
            )}

            {msg.role === "assistant" && msg.mindMap && <MindMapView data={msg.mindMap} />}
            {msg.role === "assistant" && msg.diagram && <DiagramView data={msg.diagram} />}
            {msg.role === "assistant" && msg.mcpResult && (
              msg.mcpResult.html_content
                ? <MCPHTMLView data={msg.mcpResult} />
                : msg.mcpResult.tool.includes("excalidraw") && msg.mcpResult.data
                  ? <ExcalidrawView data={msg.mcpResult} />
                  : <MCPResultCard data={msg.mcpResult} />
            )}

            {msg.role === "assistant" && msg.content !== "" && !isStreaming && (
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
                    !isServerMessageId(msg.id) && "cursor-not-allowed opacity-40",
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
                    !isServerMessageId(msg.id) && "cursor-not-allowed opacity-40",
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
