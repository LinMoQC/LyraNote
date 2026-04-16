import { useState, useRef, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, X, ArrowUp, Loader2, Bot, User, Trash2 } from "lucide-react"
import { springs } from "@/lib/animations"
import { cn } from "@/lib/cn"
import { useServerStore } from "@/store/use-server-store"
import { useAuthStore } from "@/store/use-auth-store"
import { http } from "@/lib/http"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

const QUICK_ACTIONS = [
  { label: "总结笔记", prompt: "请帮我总结以下笔记的核心要点：\n\n" },
  { label: "续写内容", prompt: "请根据以下内容继续写作，保持风格一致：\n\n" },
  { label: "润色文字", prompt: "请润色以下文字，使其更流畅自然：\n\n" },
  { label: "解释概念", prompt: "请解释以下内容中的核心概念：\n\n" },
]

let msgCounter = 1
function genMsgId() { return `copilot-msg-${msgCounter++}` }

interface CopilotPanelProps {
  notebookId?: string
  onClose: () => void
  getEditorContent: () => string
}

export function CopilotPanel({ notebookId, onClose, getEditorContent }: CopilotPanelProps) {
  const { baseUrl } = useServerStore()
  const { token } = useAuthStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [convId, setConvId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function ensureConversation(): Promise<string | null> {
    if (convId) return convId
    try {
      const endpoint = notebookId
        ? `/api/v1/notebooks/${notebookId}/conversations`
        : "/api/v1/conversations"
      const res = await http.post(endpoint, { title: "AI 帮写", source: "copilot" })
      const id: string = res.data.data.id
      setConvId(id)
      return id
    } catch {
      return null
    }
  }

  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || isStreaming) return

    setInput("")
    setIsStreaming(true)

    const activeConvId = await ensureConversation()
    if (!activeConvId) {
      setIsStreaming(false)
      return
    }

    const userMsg: Message = { id: genMsgId(), role: "user", content }
    setMessages((m) => [...m, userMsg])

    const aiMsgId = genMsgId()
    setMessages((m) => [...m, { id: aiMsgId, role: "assistant", content: "" }])

    abortRef.current = new AbortController()
    try {
      const response = await fetch(`${baseUrl}/api/v1/conversations/${activeConvId}/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
        signal: abortRef.current.signal,
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error("No response body")

      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const raw = line.slice(5).trim()
          if (raw === "[DONE]") break
          try {
            const evt = JSON.parse(raw)
            if (evt.type === "text" || evt.type === "content") {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === aiMsgId ? { ...msg, content: msg.content + (evt.content ?? "") } : msg
                )
              )
            }
          } catch { /* ignore malformed */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === aiMsgId ? { ...msg, content: "请求失败，请稍后重试。" } : msg
          )
        )
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [input, isStreaming, convId, baseUrl, token, notebookId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleQuickAction(action: { label: string; prompt: string }) {
    const noteContent = getEditorContent().trim()
    const fullPrompt = noteContent
      ? `${action.prompt}${noteContent}`
      : action.label
    handleSend(fullPrompt)
  }

  function handleClear() {
    abortRef.current?.abort()
    setMessages([])
    setConvId(null)
    setIsStreaming(false)
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--color-accent)]" />
          <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">AI 帮写</span>
        </div>
        <div className="flex items-center gap-1">
          {!isEmpty && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleClear}
              title="清空对话"
              className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-white/8 transition-colors"
            >
              <Trash2 size={13} />
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-white/8 transition-colors"
          >
            <X size={14} />
          </motion.button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {isEmpty ? (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-[var(--color-text-tertiary)] leading-relaxed">
              选中文本或使用快捷操作，我可以帮你润色、扩写、总结或翻译。
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((action) => (
                <motion.button
                  key={action.label}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleQuickAction(action)}
                  disabled={isStreaming}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-left text-[12px] border transition-colors disabled:opacity-40"
                  style={{ background: "var(--color-bg-overlay)", borderColor: "var(--color-border)" }}
                >
                  <Sparkles size={11} className="text-[var(--color-accent)] shrink-0" />
                  <span className="text-[var(--color-text-secondary)]">{action.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springs.snappy}
                className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-violet-500 to-purple-700"
                    : "bg-gradient-to-br from-violet-600 to-purple-800"
                )}>
                  {msg.role === "user"
                    ? <User size={10} className="text-white" />
                    : <Bot size={10} className="text-white" />}
                </div>
                <div className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap break-words",
                  msg.role === "user"
                    ? "bg-[var(--color-accent)] text-white rounded-tr-sm"
                    : "bg-[var(--color-bg-overlay)] text-[var(--color-text-primary)] rounded-tl-sm border"
                )}
                  style={msg.role === "assistant" ? { borderColor: "var(--color-border)" } : undefined}
                >
                  {msg.content || (isStreaming && msg.id === messages[messages.length - 1]?.id ? null : "​")}
                  {isStreaming && msg.id === messages[messages.length - 1]?.id && !msg.content && (
                    <Loader2 size={12} className="animate-spin text-[var(--color-text-tertiary)]" />
                  )}
                  {isStreaming && msg.id === messages[messages.length - 1]?.id && msg.content && (
                    <span className="inline-block w-1 h-3 bg-[var(--color-accent)] ml-0.5 animate-pulse rounded-sm" />
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--color-border)" }}>
        <div
          className="rounded-xl border p-2.5 flex flex-col gap-2"
          style={{ background: "var(--color-bg-overlay)", borderColor: "var(--color-border)" }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="告诉 AI 你的创作要求..."
            rows={2}
            className="w-full bg-transparent outline-none resize-none text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] leading-relaxed"
            style={{ fontFamily: "var(--font-sans)" }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-text-tertiary)]">↵ 发送 · Shift+↵ 换行</span>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => handleSend()}
              disabled={!input.trim() || isStreaming}
              className="flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--color-accent)] text-white disabled:opacity-30 transition-opacity"
            >
              {isStreaming
                ? <Loader2 size={11} className="animate-spin" />
                : <ArrowUp size={13} strokeWidth={2.5} />}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}
