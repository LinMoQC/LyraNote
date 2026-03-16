import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ClipboardPaste, FileText, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useState } from "react";

import { BotAvatar } from "@/components/ui/bot-avatar";
import { InlineCitationBadge } from "@/features/copilot/inline-citation";
import { MindMapView } from "@/features/copilot/mind-map-view";
import type { CitationData, Message, MindMapData } from "@/types";

type Props = {
  message: Message;
  onInsert?: (content: string) => void | Promise<void>;
  onInsertMindMap?: (data: MindMapData) => void;
};

import { processChildren, stripCitationMarkers } from "@/lib/citation-utils"

function buildReferencesBlock(citations: CitationData[]): string {
  if (!citations.length) return ""
  const lines = citations.map(
    (c, i) => `${i + 1}. **${c.source_title}**${c.excerpt ? `\n> ${c.excerpt.slice(0, 120)}…` : ""}`
  )
  return `\n\n**Reference Sources**\n\n${lines.join("\n\n")}`
}

function CitationFooter({ citations }: { citations: CitationData[] }) {
  const t = useTranslations("copilot")
  const [expanded, setExpanded] = useState(false)

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
  )
}

export const ChatMessageBubble = memo(function ChatMessageBubble({ message, onInsert, onInsertMindMap }: Props) {
  const t = useTranslations("copilot")
  const [insertState, setInsertState] = useState<"idle" | "loading" | "done">("idle")
  const [insertMindMapState, setInsertMindMapState] = useState<"idle" | "done">("idle")

  const handleInsert = useCallback(async () => {
    if (!onInsert || insertState !== "idle") return
    setInsertState("loading")
    try {
      const clean = stripCitationMarkers(message.content)
      const refs = message.citations ? buildReferencesBlock(message.citations) : ""
      await onInsert(clean + refs)
      setInsertState("done")
      setTimeout(() => setInsertState("idle"), 2000)
    } catch {
      setInsertState("idle")
    }
  }, [onInsert, insertState, message.content, message.citations])

  const handleInsertMindMap = useCallback(() => {
    if (!onInsertMindMap || !message.mindMap || insertMindMapState !== "idle") return
    onInsertMindMap(message.mindMap)
    setInsertMindMapState("done")
    setTimeout(() => setInsertMindMapState("idle"), 2000)
  }, [onInsertMindMap, message.mindMap, insertMindMapState])

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

  if (!message.content) {
    return (
      <div className="flex gap-2.5">
        <BotAvatar className="mt-0.5" />
        <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <BotAvatar className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="rounded-2xl bg-muted px-4 py-3 text-sm leading-6 text-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{processChildren(children, message.citations)}</p>,
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{processChildren(children, message.citations)}</strong>
              ),
              em: ({ children }) => <em className="italic">{processChildren(children, message.citations)}</em>,
              ul: ({ children }) => (
                <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
              ),
              li: ({ children }) => <li className="leading-6">{processChildren(children, message.citations)}</li>,
              code: ({ children, ...props }) => {
                const isInline = !("data-language" in props);
                return isInline ? (
                  <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-foreground/90">
                    {children}
                  </code>
                ) : (
                  <code className="block">{children}</code>
                );
              },
              pre: ({ children }) => (
                <pre className="mb-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5 last:mb-0">
                  {children}
                </pre>
              ),
              blockquote: ({ children }) => (
                <blockquote className="mb-2 border-l-2 border-primary/40 pl-3 text-foreground/70 last:mb-0">
                  {processChildren(children, message.citations)}
                </blockquote>
              ),
              h1: ({ children }) => (
                <h1 className="mb-2 text-base font-bold">{processChildren(children, message.citations)}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="mb-2 text-sm font-semibold">{processChildren(children, message.citations)}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-1 text-sm font-semibold text-foreground">{processChildren(children, message.citations)}</h3>
              ),
              h4: ({ children }) => (
                <h4 className="mb-1 text-xs font-semibold text-foreground/85">{processChildren(children, message.citations)}</h4>
              ),
              h5: ({ children }) => (
                <h5 className="mb-1 text-xs font-semibold text-foreground/75">{processChildren(children, message.citations)}</h5>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {message.citations && message.citations.length > 0 && (
          <CitationFooter citations={message.citations} />
        )}

        {message.mindMap && (
          <MindMapView data={message.mindMap} />
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
