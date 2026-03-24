import { useCallback, useRef, useState } from "react";
import { Bot, ChevronRight, Send, Square, X } from "lucide-react";
import { useUiStore } from "@/store/use-ui-store";
import { getHttpClient } from "@/lib/http-client";
import {
  createConversationService,
  readSseStream,
  type SseChunk,
} from "@lyranote/api-client";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function AiPanel() {
  const { isAiPanelOpen, toggleAiPanel, selectedNotebookId } = useUiStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading || !selectedNotebookId) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    const assistantMsgId = (Date.now() + 1).toString();

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantMsgId, role: "assistant", content: "", isStreaming: true },
    ]);
    setInput("");
    setIsLoading(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const conversationService = createConversationService(getHttpClient());

      if (!convIdRef.current) {
        const conv = await conversationService.createConversation(
          selectedNotebookId,
          userMsg.content.slice(0, 60),
          "chat"
        );
        convIdRef.current = conv.id;
      }

      const response = await conversationService.streamMessage(
        convIdRef.current,
        { content: userMsg.content },
        abort.signal
      );

      let fullContent = "";
      await readSseStream(response, (chunk: SseChunk) => {
        if (chunk.type === "token") {
          fullContent += chunk.content;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: fullContent } : m
            )
          );
          scrollToBottom();
        } else if (chunk.type === "done") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m
            )
          );
        }
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: "Error: Failed to get response.", isStreaming: false }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [input, isLoading, selectedNotebookId]);

  const stopStreaming = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  };

  if (!isAiPanelOpen) {
    return (
      <button
        onClick={toggleAiPanel}
        className="flex items-center justify-center w-8 bg-surface border-l border-sidebar-border text-sidebar-text-muted hover:text-sidebar-text hover:bg-sidebar-hover transition-colors"
        title="Open AI Panel"
      >
        <ChevronRight size={14} />
      </button>
    );
  }

  return (
    <div className="flex flex-col w-80 shrink-0 bg-surface border-l border-sidebar-border">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-brand" />
          <span className="text-xs font-semibold text-sidebar-text">AI Assistant</span>
        </div>
        <button
          onClick={toggleAiPanel}
          className="p-1 rounded hover:bg-sidebar-hover text-sidebar-text-muted hover:text-sidebar-text transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-sidebar-text-muted">
            <Bot size={32} className="opacity-30" />
            <p className="text-xs text-center opacity-60">
              Ask anything about your notebooks
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="p-3 border-t border-sidebar-border">
        {!selectedNotebookId && (
          <p className="text-xs text-sidebar-text-muted mb-2 text-center">
            Select a notebook to start chatting
          </p>
        )}
        <div className="flex items-end gap-2 bg-surface-raised rounded-lg px-3 py-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask AI..."
            disabled={!selectedNotebookId}
            rows={1}
            className="flex-1 bg-transparent resize-none text-xs text-sidebar-text placeholder-sidebar-text-muted outline-none min-h-[20px] max-h-32 disabled:opacity-40"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          {isLoading ? (
            <button
              onClick={stopStreaming}
              className="p-1 rounded text-sidebar-text-muted hover:text-red-400 transition-colors shrink-0"
            >
              <Square size={13} />
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim() || !selectedNotebookId}
              className="p-1 rounded text-brand hover:text-brand-hover disabled:opacity-30 transition-colors shrink-0"
            >
              <Send size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed",
          isUser
            ? "bg-brand text-white"
            : "bg-surface-raised text-sidebar-text"
        )}
      >
        {message.content || (message.isStreaming && (
          <span className="inline-flex gap-0.5">
            <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        ))}
      </div>
    </div>
  );
}
