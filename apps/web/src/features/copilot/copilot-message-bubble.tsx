import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ClipboardPaste, Loader2 } from "lucide-react";
import { m } from "framer-motion";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo, useState } from "react";

import { BotAvatar } from "@/components/ui/bot-avatar";
import { CitationFooter } from "@/components/message-render/citation-footer";
import { MCPHTMLView, MCPResultCard } from "@/components/message-render/mcp-result-views";
import { MindMapView } from "@/components/message-render/mind-map-view";
import { DiagramView } from "@/components/message-render/diagram-view";
import { ExcalidrawView } from "@/components/message-render/excalidraw-view";
import { ChoiceCards } from "@/components/message-render/choice-cards";
import { AgentSteps, ThinkingBubble } from "@/components/message-render/agent-steps";
import { MarkdownContent } from "@/components/message-render/markdown-content";
import { CodeBlock } from "@/components/message-render/code-block";
import { parseMessageContent } from "@/components/message-render/parse-message-content";
import { buildMarkdownComponents } from "@/components/genui";
import type { AgentEvent } from "@/services/ai-service";
import type { Message, MindMapData } from "@/types";
import { stripCitationMarkers } from "@/lib/citation-utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";

type Props = {
  message: Message;
  isLastAssistant?: boolean;
  streaming?: boolean;
  liveAgentSteps?: AgentEvent[];
  onInsert?: (content: string) => void | Promise<void>;
  onInsertMindMap?: (data: MindMapData) => void;
};

function buildReferencesBlock(citations: NonNullable<Message["citations"]>): string {
  if (!citations.length) return "";
  const lines = citations.map(
    (c, i) => `${i + 1}. **${c.source_title}**${c.excerpt ? `\n> ${c.excerpt.slice(0, 120)}…` : ""}`,
  );
  return `\n\n**Reference Sources**\n\n${lines.join("\n\n")}`;
}

function StreamingEllipsis() {
  return (
    <div className="mt-3 flex items-end gap-1.5 text-foreground/42" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <m.span
          key={dot}
          className="h-2 w-2 rounded-full bg-current"
          animate={{ y: [0, -8, 0], opacity: [0.35, 1, 0.45], scale: [1, 1.12, 1] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            ease: "easeInOut",
            delay: dot * 0.14,
          }}
        />
      ))}
    </div>
  );
}

export const CopilotMessageBubble = memo(function CopilotMessageBubble({
  message,
  isLastAssistant = false,
  streaming = false,
  liveAgentSteps = [],
  onInsert,
  onInsertMindMap,
}: Props) {
  const t = useTranslations("copilot");
  const { user } = useAuth();
  const avatarUrl = user?.avatar_url ?? null;
  const initials = (user?.name?.[0] ?? user?.username?.[0] ?? "U").toUpperCase();
  const [insertState, setInsertState] = useState<"idle" | "loading" | "done">("idle");
  const [insertMindMapState, setInsertMindMapState] = useState<"idle" | "done">("idle");

  const isStreaming = isLastAssistant && streaming;
  const isSpinning = isLastAssistant && message.content === "";

  const stepsToShow = isLastAssistant && liveAgentSteps.length > 0
    ? liveAgentSteps
    : message.agentSteps;

  const mdComponents = useMemo(
    () => buildMarkdownComponents({ citations: message.citations, isMermaidStreaming: isStreaming, CodeBlock }),
    [message.citations, isStreaming],
  );

  const { textContent, choices, needsRichMarkdown } = useMemo(
    () => parseMessageContent(message.content),
    [message.content],
  );

  const handleInsert = useCallback(async () => {
    if (!onInsert || insertState !== "idle") return;
    setInsertState("loading");
    try {
      const clean = stripCitationMarkers(textContent || message.content);
      const refs = message.citations ? buildReferencesBlock(message.citations) : "";
      await onInsert(clean + refs);
      setInsertState("done");
      setTimeout(() => setInsertState("idle"), 2000);
    } catch {
      setInsertState("idle");
    }
  }, [onInsert, insertState, textContent, message.content, message.citations]);

  const handleInsertMindMap = useCallback(() => {
    if (!onInsertMindMap || !message.mindMap || insertMindMapState !== "idle") return;
    onInsertMindMap(message.mindMap);
    setInsertMindMapState("done");
    setTimeout(() => setInsertMindMapState("idle"), 2000);
  }, [onInsertMindMap, message.mindMap, insertMindMapState]);

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className={isStreaming ? "pt-8" : undefined}
    >
      {message.role === "assistant" && stepsToShow?.length ? (
        <AgentSteps
          steps={stepsToShow}
          isStreaming={isStreaming}
          defaultOpen={false}
          className="mb-4"
        />
      ) : null}

      <div className={cn("flex gap-2.5", message.role === "user" ? "justify-end" : "justify-start")}>
        {message.role === "assistant" && (
          <div className="relative flex-shrink-0 self-start">
            <BotAvatar
              spinning={isSpinning}
              className={isSpinning ? undefined : "mt-0.5 h-6 w-6"}
            />
            {isStreaming && (
              <div className="absolute bottom-full left-0 mb-3 w-max max-w-[180px]">
                <ThinkingBubble steps={liveAgentSteps} />
              </div>
            )}
          </div>
        )}

        <div className={cn("min-w-0 max-w-[85%]", message.role === "assistant" && "flex-1")}>
          {message.role === "user" ? (
            <div className="space-y-1.5">
              {message.quotedText ? (
                <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted px-3 py-2">
                  <div className="mt-1 h-3 w-0.5 flex-shrink-0 rounded-full bg-primary/50" />
                  <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground/60">
                    {message.quotedText}
                  </p>
                </div>
              ) : null}
              <div className="rounded-2xl rounded-br-sm bg-primary px-3 py-2.5 text-sm leading-relaxed text-white selection:bg-white/30 selection:text-white">
                <p>{message.content}</p>
              </div>
            </div>
          ) : (
            <>
              {!isSpinning && (
                <div className="rounded-2xl rounded-bl-sm bg-black/[0.04] px-3 py-2.5 text-sm leading-6 text-foreground dark:bg-white/[0.07]">
                  {needsRichMarkdown ? (
                    <div className="text-sm leading-relaxed text-foreground/85">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                        {textContent}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <MarkdownContent content={textContent} citations={message.citations} />
                  )}
                  {choices && <ChoiceCards choices={choices} onSelect={(q) => onInsert?.(q)} />}
                  {isStreaming && <StreamingEllipsis />}
                </div>
              )}

              {message.citations && message.citations.length > 0 && (
                <CitationFooter citations={message.citations} content={message.content} />
              )}

              {message.mindMap && <MindMapView data={message.mindMap} />}
              {message.diagram && <DiagramView data={message.diagram} />}
              {message.mcpResult && (
                message.mcpResult.html_content
                  ? <MCPHTMLView data={message.mcpResult} />
                  : message.mcpResult.tool.includes("excalidraw") && message.mcpResult.data
                    ? <ExcalidrawView data={message.mcpResult} />
                    : <MCPResultCard data={message.mcpResult} />
              )}

              {(onInsert && message.content) || (onInsertMindMap && message.mindMap) ? (
                <div className="mt-1.5 flex gap-1 px-1">
                  {onInsert && message.content && (
                    <button
                      type="button"
                      onClick={handleInsert}
                      disabled={insertState !== "idle"}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all
                        ${insertState === "done"
                          ? "text-emerald-400"
                          : insertState === "loading"
                          ? "cursor-wait text-muted-foreground/40"
                          : "text-muted-foreground/50 hover:bg-accent/60 hover:text-foreground"
                        }`}
                      title={t("insertToEditor")}
                    >
                      {insertState === "loading" ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : insertState === "done" ? (
                        <Check size={11} />
                      ) : (
                        <ClipboardPaste size={11} />
                      )}
                      {insertState === "done" ? t("inserted") : t("insertText")}
                    </button>
                  )}
                  {onInsertMindMap && message.mindMap && (
                    <button
                      type="button"
                      onClick={handleInsertMindMap}
                      disabled={insertMindMapState !== "idle"}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all
                        ${insertMindMapState === "done"
                          ? "text-emerald-400"
                          : "text-muted-foreground/50 hover:bg-accent/60 hover:text-foreground"
                        }`}
                      title={t("insertMindMapToEditor")}
                    >
                      {insertMindMapState === "done" ? (
                        <Check size={11} />
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="shrink-0">
                          <circle cx="8" cy="8" r="2" fill="currentColor" />
                          <line x1="8" y1="6" x2="8" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="6" y1="8" x2="2" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="10" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      )}
                      {insertMindMapState === "done" ? t("embedded") : t("insertMindMap")}
                    </button>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>

        {message.role === "user" && (
          <div className="relative flex h-6 w-6 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={initials}
                className="h-full w-full object-cover"
                onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
              />
            ) : null}
            <span className={cn("absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white", avatarUrl && "hidden")}>
              {initials}
            </span>
          </div>
        )}
      </div>
    </m.div>
  );
});
