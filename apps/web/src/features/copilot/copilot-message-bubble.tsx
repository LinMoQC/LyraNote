import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ClipboardPaste, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo, useState } from "react";

import { BotAvatar } from "@/components/ui/bot-avatar";
import { CitationFooter } from "@/components/message-render/citation-footer";
import { MCPHTMLView, MCPResultCard } from "@/components/message-render/mcp-result-views";
import { MindMapView } from "@/components/message-render/mind-map-view";
import { DiagramView } from "@/components/message-render/diagram-view";
import { ExcalidrawView } from "@/components/message-render/excalidraw-view";
import { ChoiceCards } from "@/components/message-render/choice-cards";
import { parseMessageContent } from "@/components/message-render/parse-message-content";
import { buildMarkdownComponents } from "@/components/genui";
import type { Message, MindMapData } from "@/types";
import { stripCitationMarkers } from "@/lib/citation-utils";

type Props = {
  message: Message;
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

export const CopilotMessageBubble = memo(function CopilotMessageBubble({ message, onInsert, onInsertMindMap }: Props) {
  const t = useTranslations("copilot");
  const [insertState, setInsertState] = useState<"idle" | "loading" | "done">("idle");
  const [insertMindMapState, setInsertMindMapState] = useState<"idle" | "done">("idle");

  const mdComponents = useMemo(
    () => buildMarkdownComponents({ citations: message.citations }),
    [message.citations],
  );

  const { textContent, choices } = useMemo(
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

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="ml-auto max-w-[85%] space-y-1.5">
          {message.quotedText ? (
            <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted px-3 py-2">
              <div className="mt-1 h-3 w-0.5 flex-shrink-0 rounded-full bg-primary/50" />
              <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground/60">
                {message.quotedText}
              </p>
            </div>
          ) : null}
          <div className="rounded-2xl bg-primary px-4 py-2.5 text-sm leading-6 text-primary-foreground">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  const hasRichMedia = !!(message.diagram || message.mindMap || message.mcpResult);
  const isLoading = !message.content && !hasRichMedia;

  if (isLoading) {
    return (
      <div className="flex gap-2.5">
        <BotAvatar spinning />
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <BotAvatar className="mt-0.5" />

      <div className="min-w-0 flex-1">
        {textContent && (
          <div className="rounded-2xl bg-muted px-4 py-3 text-sm leading-6 text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {textContent}
            </ReactMarkdown>
          </div>
        )}
        {choices && <ChoiceCards choices={choices} onSelect={(q) => onInsert?.(q)} />}

        {message.citations && message.citations.length > 0 && (
          <CitationFooter citations={message.citations} />
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
                title="插入文字内容到编辑器"
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
                title="将思维导图嵌入编辑器"
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
      </div>
    </div>
  );
});
