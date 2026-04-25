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
import { Copy, FileText, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

import { BotAvatar } from "@/components/ui/bot-avatar";
import { cn } from "@/lib/utils";
import { DeepResearchProgress } from "@/components/deep-research/deep-research-progress";
import { CodeBlock } from "@lyranote/ui/message-render";
import { buildMarkdownComponents } from "@lyranote/ui/genui";
import type { AgentEvent } from "@/services/ai-service";
import type { FeedbackRating } from "@/services/feedback-service";
import type { LocalMessage } from "./chat-types";
import { formatTime, isServerMessageId } from "./chat-helpers";
import {
  AgentSteps,
  AttachmentImage,
  ChoiceCards,
  CitationFooter,
  DiagramView,
  ExcalidrawView,
  MarkdownContent,
  MCPHTMLView,
  MCPResultCard,
  MindMapView,
  parseMessageContent,
  ReasoningBlock,
  ThinkingBubble,
} from "@lyranote/ui/message-render";

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
  onEdit?: (msgId: string, content: string) => void;
  onSaveDeepResearchNote?: (report?: string, title?: string) => void;
  onSaveDeepResearchSources?: () => void;
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
  onEdit,
  onFeedback,
  onRegenerate,
  onFollowUp,
  onSaveDeepResearchNote,
  onSaveDeepResearchSources,
  onArtifact,
}: ChatMessageBubbleProps) {
  const t = useTranslations("chat");
  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);

  const stepsToShow = isLastAssistant && liveAgentSteps.length > 0 ? liveAgentSteps : msg.agentSteps;
  const isStreaming = isLastAssistant && streaming;
  const isSpinning = isLastAssistant && msg.content === "";
  const hasDeepResearchDone =
    msg.role === "assistant" &&
    msg.deepResearch?.status === "done" &&
    !!msg.deepResearch.reportTokens;
  // Pre-tool phase: a non-system thought arrived but no tool_call yet.
  // Non-system thoughts are emitted by the engine ONLY immediately before a tool_call,
  // so this window is narrow and deterministic. During this phase the content area
  // still holds the draining transition text — hide it so only the ThinkingBubble shows.
  const isPreToolPhase =
    isStreaming &&
    liveAgentSteps.some((s) => s.type === "thought" && !s.is_system) &&
    !liveAgentSteps.some((s) => s.type === "tool_call");
  const showBubble =
    msg.role === "user" ||
    ((msg.content !== "" || !!msg.diagram) && !isPreToolPhase);

  const { textContent, choices, needsRichMarkdown } = useMemo(
    () => parseMessageContent(msg.content),
    [msg.content],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mdComponents = useMemo(() => buildMarkdownComponents({
    citations: msg.citations,
    isMermaidStreaming: isStreaming,
    isStreaming,
    CodeBlock,
    onArtifact,
  }), [msg.citations, isStreaming, onArtifact]);

  return (
    <m.div
      initial={{
        opacity: 0,
        y: msg.role === "user" ? 24 : 10,
        scale: msg.role === "user" ? 0.97 : 1,
      }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: msg.role === "user" ? 350 : 300,
        damping: msg.role === "user" ? 32 : 28,
      }}
    >
      {msg.role === "assistant" && msg.deepResearch && (
        <div className="mb-3">
          <DeepResearchProgress
            progress={msg.deepResearch.status === "done" ? msg.deepResearch : { ...msg.deepResearch, reportTokens: "" }}
            onSaveNote={onSaveDeepResearchNote}
            onSaveSources={onSaveDeepResearchSources}
            onFollowUp={(q) => onFollowUp(q)}
            onCopy={(text) => onCopy(text)}
          />
        </div>
      )}

      {msg.role === "assistant" && !msg.deepResearch && stepsToShow?.length ? (
        <AgentSteps
          steps={stepsToShow}
          isStreaming={isStreaming}
          defaultOpen={false}
          className="mb-4"
        />
      ) : null}

      {!hasDeepResearchDone && (
        <div className={cn("flex gap-2 md:gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
          {msg.role === "assistant" && (
            <div className="relative flex-shrink-0 self-start">
              <BotAvatar
                spinning={isSpinning}
                className={isSpinning ? undefined : "h-6 w-6 md:h-7 md:w-7"}
              />
              {isStreaming && (
                <div className="absolute bottom-full left-0 mb-3 w-max max-w-[180px]">
                  <ThinkingBubble steps={liveAgentSteps} />
                </div>
              )}
            </div>
          )}
          <div className="min-w-0 max-w-[85%] md:max-w-[85%]">
            {msg.role === "assistant" && msg.reasoning && showReasoning && (
              <ReasoningBlock content={msg.reasoning} streaming={isStreaming} />
            )}
            <AnimatePresence>
            {showBubble && (
              <m.div
                key="bubble"
                initial={msg.role === "assistant" ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                data-testid={msg.role === "assistant" ? "assistant-message-bubble" : "user-message-bubble"}
                className={cn(
                  "rounded-2xl px-3 py-2.5 md:px-4 md:py-3",
                  msg.role === "user"
                    ? "rounded-br-sm bg-primary text-white selection-on-primary"
                    : "rounded-bl-sm bg-muted/50 text-foreground",
                )}
              >
                {msg.role === "assistant" ? (
                  <>
                    {msg.content !== "" && (
                      needsRichMarkdown ? (
                        <div className={cn("text-sm leading-relaxed text-foreground/85", isStreaming && "streaming-cursor")}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                            {textContent}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <MarkdownContent content={textContent} citations={msg.citations} showCursor={isStreaming} />
                      )
                    )}
                    {choices && <ChoiceCards choices={choices} onSelect={onFollowUp} />}
                    {msg.diagram && <DiagramView data={msg.diagram} variant="embedded" />}
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
                {msg.role === "assistant" && msg.content !== "" && (
                  <p className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground/40">
                    <span>{formatTime(msg.timestamp, t)}</span>
                    {msg.speed && !isStreaming && (() => {
                      const totalSec = (msg.speed.ttft_ms + (msg.speed.tokens / (msg.speed.tps || 1)) * 1000) / 1000;
                      const label = totalSec >= 1 ? `${totalSec.toFixed(1)}s` : `${msg.speed.ttft_ms}ms`;
                      const tokenLabel = t("tokenCost", { count: numberFormatter.format(msg.speed.tokens) });
                      return (
                        <span
                          className="tabular-nums"
                          title={`TTFT ${msg.speed.ttft_ms}ms · ${msg.speed.tps} tok/s · ${msg.speed.tokens} tokens`}
                        >
                          {t("timeCost", { label })} · {tokenLabel}
                        </span>
                      );
                    })()}
                  </p>
                )}
              </m.div>
            )}
            </AnimatePresence>

            {msg.role === "user" && msg.content !== "" && (
              <div className="mt-1.5 flex items-center justify-end gap-1.5 text-muted-foreground/40">
                <span className="text-[10px]">{formatTime(msg.timestamp, t)}</span>
                <button
                  type="button"
                  onClick={() => onCopy(msg.content)}
                  className="rounded-md p-1 transition-colors hover:bg-accent hover:text-muted-foreground"
                  title={copied ? t("copied") : t("copy")}
                >
                  <Copy size={13} />
                </button>
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(msg.id, msg.content)}
                    className="rounded-md p-1 transition-colors hover:bg-accent hover:text-muted-foreground"
                    title={t("edit")}
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            )}

            {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
              <CitationFooter citations={msg.citations} content={msg.content} namespace="chat" />
            )}

            {msg.role === "assistant" && msg.mindMap && <MindMapView data={msg.mindMap} />}
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
