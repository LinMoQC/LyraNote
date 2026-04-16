import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Sparkles, Loader2, Copy, ThumbsUp, ThumbsDown, Check, Paperclip } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { DesktopChatInput, type DesktopChatInputHandle, type DesktopChatInputSubmitPayload } from "@/components/chat-input/desktop-chat-input"
import { pageVariants, pageTransition, springs, staggerContainer, staggerItem } from "@/lib/animations"
import { http } from "@/lib/http"
import { useServerStore } from "@/store/use-server-store"
import { useAuthStore } from "@/store/use-auth-store"
import { useChatDraftStore } from "@/store/use-chat-draft-store"
import { buildMarkdownComponents } from "@/components/genui"
import { parseMessageContent } from "@/components/message-render/parse-message-content"
import { MarkdownContent } from "@/components/message-render/markdown-content"
import { CodeBlock } from "@/components/message-render/code-block"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  attachments?: { name: string; url?: string; isImage?: boolean }[]
}

interface ConversationItem {
  id: string
  title: string | null
  created_at: string
}

const SUGGESTIONS = [
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "帮我分析知识库中的核心主题" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "为我的研究生成一份结构化摘要" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "对比不同来源中的相似观点" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "根据笔记内容生成学习计划" },
]



let msgCounter = 1
function genMsgId() { return `msg-${msgCounter++}` }

// ── ThinkingDots ─────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-[5px] py-0.5 h-6">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[6px] h-[6px] rounded-full"
          style={{ background: "var(--color-text-tertiary)" }}
          animate={{ opacity: [0.25, 0.75, 0.25], scale: [0.8, 1.15, 0.8] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
        />
      ))}
    </div>
  )
}

// ── StreamingCursor ───────────────────────────────────────────────────────────

function StreamingCursor() {
  return (
    <motion.span
      className="inline-block align-middle ml-0.5"
      style={{
        width: 2,
        height: 14,
        borderRadius: 1,
        background: "var(--color-accent)",
        display: "inline-block",
      }}
      animate={{ opacity: [1, 0.2, 1] }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
    />
  )
}

// ── MessageBody ───────────────────────────────────────────────────────────────

interface MessageBodyProps {
  content: string
  isLastStreaming: boolean
}

function MessageBody({ content, isLastStreaming }: MessageBodyProps) {
  const { textContent, needsRichMarkdown } = useMemo(
    () => parseMessageContent(content),
    [content],
  )

  const mdComponents = useMemo(
    () => buildMarkdownComponents({ isMermaidStreaming: isLastStreaming, CodeBlock }),
    [isLastStreaming],
  )

  const isThinking = isLastStreaming && !content

  if (isThinking) return <ThinkingDots />

  return (
    <>
      {needsRichMarkdown ? (
        <div className="text-[13.5px] leading-[1.75]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {textContent}
          </ReactMarkdown>
        </div>
      ) : (
        <MarkdownContent content={textContent} />
      )}
      {isLastStreaming && <StreamingCursor />}
    </>
  )
}

// ── AiAvatar ─────────────────────────────────────────────────────────────────

function AiAvatar() {
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-white/10 bg-white/5">
      <img src="/bot_avatar.png" alt="AI Avatar" className="w-full h-full object-cover" />
    </div>
  )
}

// ── UserAvatar ────────────────────────────────────────────────────────────────

function UserAvatar() {
  const { user } = useAuthStore()
  const displayName = user?.name ?? user?.username ?? "用户"
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-white/10"
      style={{
        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
      }}
    >
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt={displayName} className="w-full h-full object-cover" />
      ) : (
        <span className="text-white text-[11px] font-semibold">{initial}</span>
      )}
    </div>
  )
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
      style={{ color: copied ? "var(--color-accent)" : "var(--color-text-tertiary)" }}
      title="复制"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

// ── ChatPage ──────────────────────────────────────────────────────────────────

export function ChatPage({ initialMessage, initialDraftId }: ChatPageProps) {
  const { baseUrl } = useServerStore()
  const { token } = useAuthStore()
  const { consumeDraft } = useChatDraftStore()
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const didAutoSend = useRef(false)
  const composerRef = useRef<DesktopChatInputHandle>(null)

  useEffect(() => { 
    fetchConversations()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (initialMessage && !didAutoSend.current && !loadingConvs) {
      didAutoSend.current = true
      void handleSend({ content: initialMessage, attachments: [] })
    }
  }, [initialMessage, loadingConvs]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialDraftId && !didAutoSend.current && !loadingConvs) {
      const draft = consumeDraft(initialDraftId)
      if (!draft) return
      didAutoSend.current = true
      void handleSend(draft)
    }
  }, [consumeDraft, initialDraftId, loadingConvs])

  async function fetchConversations() {
    setLoadingConvs(true)
    try {
      const res = await http.get("/api/v1/conversations")
      setConversations(res.data.data ?? [])
    } finally {
      setLoadingConvs(false)
    }
  }

  async function openConversation(conv: ConversationItem) {
    if (conv.id === activeConvId) return
    setActiveConvId(conv.id)
    setMessages([])
    setLoadingMsgs(true)
    try {
      const res = await http.get(`/api/v1/conversations/${conv.id}/messages`)
      const msgs: Message[] = (res.data.data ?? []).map((m: { id: string; role: string; content: string }) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
      setMessages(msgs)
    } finally {
      setLoadingMsgs(false)
    }
  }

  const handleSend = useCallback(async ({ content, attachments }: DesktopChatInputSubmitPayload) => {
    const trimmedContent = content.trim()
    if ((!trimmedContent && attachments.length === 0) || isStreaming) return

    setIsStreaming(true)

    let convId = activeConvId
    if (!convId) {
      try {
        const res = await http.post("/api/v1/conversations", { title: trimmedContent.slice(0, 40) })
        const newConv: ConversationItem = res.data.data
        convId = newConv.id
        setActiveConvId(convId)
        setConversations((prev) => [newConv, ...prev])
      } catch {
        setIsStreaming(false)
        return
      }
    }

    // Capture attachments locally before upload block finishes to safely render preview
    const filesContext = attachments.map((attachment) => ({
      name: attachment.file.name,
      url: attachment.previewUrl,
      isImage: attachment.file.type.startsWith("image/"),
    }))

    const userMsg: Message = { id: genMsgId(), role: "user", content: trimmedContent, attachments: filesContext }
    setMessages((m) => [...m, userMsg])

    const serverAttachmentIds = attachments.map((attachment) => attachment.serverId).filter(Boolean) as string[]

    const aiMsgId = genMsgId()
    setMessages((m) => [...m, { id: aiMsgId, role: "assistant", content: "" }])

    abortRef.current = new AbortController()
    try {
      const payload: { content: string; attachments?: string[] } = { content: trimmedContent }
      if (serverAttachmentIds.length > 0) {
        payload.attachments = serverAttachmentIds
      }

      const response = await fetch(`${baseUrl}/api/v1/conversations/${convId}/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
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
            if ((evt.type === "token" || evt.type === "text" || evt.type === "content") && evt.content) {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === aiMsgId ? { ...msg, content: msg.content + evt.content } : msg
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
  }, [isStreaming, activeConvId, baseUrl, token])

  function startNewConversation() {
    abortRef.current?.abort()
    setMessages([])
    setActiveConvId(null)
    setIsStreaming(false)
    composerRef.current?.clear()
    setTimeout(() => composerRef.current?.focus(), 100)
  }

  const isEmpty = messages.length === 0
  const lastMsgId = messages[messages.length - 1]?.id

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex h-full"
    >
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div
        className="w-56 shrink-0 flex flex-col border rounded-xl overflow-hidden ml-2 mt-2 mb-2"
        style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.012)" }}
      >
        {/* New conversation button */}
        <div className="px-4 pt-6 pb-3 shrink-0">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={startNewConversation}
            className="flex items-center gap-2.5 text-[13px] font-medium transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            whileHover={{ color: "var(--color-text-primary)" }}
          >
            <span
              className="w-[22px] h-[22px] rounded-full flex items-center justify-center"
              style={{ background: "var(--color-bg-subtle)" }}
            >
              <Plus size={12} strokeWidth={2.5} style={{ color: "var(--color-text-secondary)" }} />
            </span>
            新对话
          </motion.button>
        </div>

        {/* Section label */}
        {conversations.length > 0 && (
          <div className="px-4 pb-1.5 shrink-0">
            <span
              className="text-[11px] font-medium"
              style={{ color: "var(--color-text-tertiary)", opacity: 0.6 }}
            >
              最近对话
            </span>
          </div>
        )}

        {/* Conversation list — flat, no date groups, scrollbar hidden */}
        <div className="flex-1 overflow-y-auto pb-3 no-scrollbar">
          <div className="flex flex-col gap-[2px] px-2 py-1">
          {loadingConvs ? (
            <div className="flex justify-center pt-6">
              <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-[11.5px] px-4 pt-2" style={{ color: "var(--color-text-tertiary)" }}>
              暂无对话记录
            </p>
          ) : (
            conversations.map((conv) => {
              const isActive = activeConvId === conv.id
              return (
                <motion.button
                  key={conv.id}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => openConversation(conv)}
                  className={`relative w-full text-left px-3 py-[7px] text-[13px] transition-colors duration-100 block overflow-hidden rounded-lg ${
                    isActive
                      ? "bg-white/[0.12]"
                      : "hover:bg-white/[0.05]"
                  }`}
                  style={
                    isActive
                      ? { color: "var(--color-text-primary)", fontWeight: 600 }
                      : { color: "var(--color-text-secondary)" }
                  }
                >
                  {/* Title with right-fade mask */}
                  <span
                    className="block whitespace-nowrap"
                    style={{
                      maskImage: "linear-gradient(to right, black 70%, transparent 100%)",
                      WebkitMaskImage: "linear-gradient(to right, black 70%, transparent 100%)",
                    }}
                  >
                    {conv.title ?? "新对话"}
                  </span>
                </motion.button>
              )
            })
          )}
          </div>
        </div>
      </div>

      {/* ── Main chat area ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {loadingMsgs ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
          </div>

        ) : isEmpty ? (
          /* ── Empty state ──────────────────────────────────────────── */
          <motion.div
            variants={pageVariants}
            initial="initial"
            animate="animate"
            className="flex-1 flex flex-col items-center justify-center gap-6 px-8"
          >
            <div className="flex flex-col items-center gap-4 text-center mb-4">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-white/10 bg-white/5 drop-shadow-xl">
                <img src="/bot_avatar.png" alt="AI Avatar" className="w-full h-full object-cover" />
              </div>
              <div>
                <h2 className="text-[17px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
                  有什么我可以帮你的？
                </h2>
                <p className="text-[12px] mt-1.5" style={{ color: "var(--color-text-tertiary)" }}>
                  基于你的知识库，我可以帮你分析、总结和探索任何内容
                </p>
              </div>
            </div>

            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-2 gap-2 w-full max-w-[560px]"
            >
              {SUGGESTIONS.map((s, idx) => (
                <motion.button
                  key={idx}
                  variants={staggerItem}
                  transition={springs.bouncy}
                  whileHover={{ scale: 1.01, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    void handleSend({ content: s.text, attachments: [] })
                  }}
                  className="flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-left text-[12.5px] transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.015)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span className="shrink-0">{s.icon}</span>
                  <span className="leading-snug truncate">{s.text}</span>
                </motion.button>
              ))}
            </motion.div>
          </motion.div>

        ) : (
          /* ── Message list ─────────────────────────────────────────── */
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <div className="max-w-[680px] w-full mx-auto px-6 py-8 flex flex-col gap-8">
              <AnimatePresence initial={false}>
                {messages.map((msg) => {
                  const isLastStreaming = isStreaming && msg.id === lastMsgId
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={springs.snappy}
                    >
                      {msg.role === "user" ? (
                        /* ── User message ─────────────────────────── */
                        <div className="flex items-start gap-3 justify-end">
                          <div className="flex flex-col items-end gap-1.5 max-w-[70%]">
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {msg.attachments.map((att, i) => (
                                  att.isImage && att.url ? (
                                    <div key={i} className="h-32 w-32 md:h-40 md:w-40 overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#ffffff0a]">
                                      <img src={att.url} alt={att.name} className="h-full w-full object-cover" />
                                    </div>
                                  ) : (
                                    <div key={i} className="flex h-8 items-center gap-2 bg-[#ffffff12] border border-[rgba(255,255,255,0.06)] rounded-lg px-2.5 text-[12px] text-white">
                                      <Paperclip size={12} className="opacity-70 shrink-0" />
                                      <span className="max-w-[140px] truncate">{att.name}</span>
                                    </div>
                                  )
                                ))}
                              </div>
                            )}
                            {msg.content && (
                              <div
                                className="px-4 py-3 rounded-[18px] rounded-tr-[5px] text-[13.5px] leading-[1.7] text-white whitespace-pre-wrap"
                                style={{ background: "var(--color-accent)" }}
                              >
                                {msg.content}
                              </div>
                            )}
                          </div>
                          <UserAvatar />
                        </div>
                      ) : (
                        /* ── AI message ───────────────────────────── */
                        <div className="flex items-start gap-3">
                          <AiAvatar />
                          <div className="flex-1 min-w-0">
                            {/* Content */}
                            <div
                              className="text-[13.5px] leading-[1.75]"
                              style={{ color: "var(--color-text-primary)" }}
                            >
                              <MessageBody content={msg.content} isLastStreaming={isLastStreaming} />
                            </div>

                            {/* Action bar — shown only when done streaming */}
                            {!isLastStreaming && msg.content && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.2, duration: 0.25 }}
                                className="flex items-center gap-0.5 mt-3"
                              >
                                <CopyButton text={msg.content} />
                                <button
                                  className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                                  style={{ color: "var(--color-text-tertiary)" }}
                                  title="有帮助"
                                >
                                  <ThumbsUp size={13} />
                                </button>
                                <button
                                  className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                                  style={{ color: "var(--color-text-tertiary)" }}
                                  title="没帮助"
                                >
                                  <ThumbsDown size={13} />
                                </button>
                              </motion.div>
                            )}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* ── Input area ──────────────────────────────────────────────── */}
        <div className="pb-4 pt-2 shrink-0">
          <div className="max-w-[720px] mx-auto px-4 sm:px-6">
            <DesktopChatInput
              ref={composerRef}
              placeholder="向 AI 提问，或描述你想探索的内容…"
              onSubmit={handleSend}
              streaming={isStreaming}
              onCancel={() => abortRef.current?.abort()}
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

interface ChatPageProps {
  initialMessage?: string
  initialDraftId?: string
}
