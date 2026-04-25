import { useState, useRef, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlignLeft, Plus, Sparkles, Loader2, Copy, ThumbsUp, ThumbsDown, Check, Paperclip } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { DesktopChatInput, type DesktopChatInputHandle } from "@/components/chat-input/desktop-chat-input"
import { pageVariants, pageTransition, springs, staggerContainer, staggerItem } from "@/lib/animations"
import { useAuthStore } from "@/store/use-auth-store"
import { buildMarkdownComponents } from "@lyranote/ui/genui"
import {
  AgentSteps,
  CitationFooter,
  CodeBlock,
  ChoiceCards,
  DiagramView,
  ExcalidrawView,
  MarkdownContent,
  MCPHTMLView,
  MCPResultCard,
  MindMapView,
  parseMessageContent,
  ThinkingBubble,
} from "@lyranote/ui/message-render"
import { useChatPage } from "@/features/chat/use-chat-page"

const SUGGESTIONS = [
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "帮我分析知识库中的核心主题" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "为我的研究生成一份结构化摘要" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "对比不同来源中的相似观点" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "根据笔记内容生成学习计划" },
]

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
  citations?: import("@/types").CitationData[]
  onFollowUp?: (q: string) => void
}

function MessageBody({ content, isLastStreaming, citations, onFollowUp }: MessageBodyProps) {
  const { textContent, choices, needsRichMarkdown } = useMemo(
    () => parseMessageContent(content),
    [content],
  )

  const mdComponents = useMemo(
    () => buildMarkdownComponents({ citations, isMermaidStreaming: isLastStreaming, CodeBlock }),
    [citations, isLastStreaming],
  )

  if (isLastStreaming && !content) return null

  return (
    <>
      {needsRichMarkdown ? (
        <div className="text-[13.5px] leading-[1.75]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {textContent}
          </ReactMarkdown>
        </div>
      ) : (
        <MarkdownContent content={textContent} citations={citations} />
      )}
      {choices && onFollowUp && <ChoiceCards choices={choices} onSelect={onFollowUp} />}
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
  const {
    activeConvId,
    conversations,
    isStreaming,
    liveAgentSteps,
    loadingConvs,
    loadingMsgs,
    messages,
    openConversation,
    startNewConversation,
    handleSend,
    cancelStreaming,
    lastMessageId,
  } = useChatPage({ initialMessage, initialDraftId })
  const bottomRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<DesktopChatInputHandle>(null)

  useEffect(() => { 
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleNewConversation() {
    startNewConversation()
    composerRef.current?.clear()
    setTimeout(() => composerRef.current?.focus(), 100)
  }

  const isEmpty = messages.length === 0
  const lastMsgId = lastMessageId

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
            onClick={handleNewConversation}
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
            conversations.map((conv: { id: string; title?: string | null }) => {
              const isActive = activeConvId === conv.id
              return (
                <motion.button
                  key={conv.id}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => openConversation(conv.id)}
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
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
                                className="select-text px-4 py-3 rounded-[18px] rounded-tr-[5px] text-[13.5px] leading-[1.7] text-white whitespace-pre-wrap"
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
                        <>
                        {(() => {
                          const steps = isLastStreaming && liveAgentSteps.length > 0
                            ? liveAgentSteps
                            : msg.agentSteps
                          return steps && steps.length > 0 ? (
                            <AgentSteps steps={steps} isStreaming={isLastStreaming} defaultOpen={false} className="mb-4" />
                          ) : null
                        })()}
                        <div className="flex items-start gap-3">
                          <div className="relative flex-shrink-0">
                            <AiAvatar />
                            {isLastStreaming && (
                              <div className="absolute bottom-full left-0 mb-2 w-max max-w-[200px]">
                                <ThinkingBubble steps={liveAgentSteps} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {msg.mode === "offline_cache" && (
                              <div
                                className="mb-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium text-amber-300"
                                style={{ borderColor: "rgba(251,191,36,0.28)", background: "rgba(251,191,36,0.08)" }}
                              >
                                <AlignLeft size={10} />
                                本地离线回答
                              </div>
                            )}
                            {/* Content */}
                            <div
                              className="select-text text-[13.5px] leading-[1.75]"
                              style={{ color: "var(--color-text-primary)" }}
                            >
                              <MessageBody
                                content={msg.content}
                                isLastStreaming={isLastStreaming}
                                citations={msg.citations}
                                onFollowUp={(q) => void handleSend({ content: q, attachments: [] })}
                              />
                            </div>

                            {/* Citation footer */}
                            {msg.citations && msg.citations.length > 0 && (
                              <CitationFooter citations={msg.citations} content={msg.content} namespace="chat" />
                            )}

                            {/* Rich attachments: mind map, diagram, MCP results */}
                            {msg.mindMap && <MindMapView data={msg.mindMap} />}
                            {msg.diagram && <DiagramView data={msg.diagram} />}
                            {msg.mcpResult && (
                              msg.mcpResult.html_content
                                ? <MCPHTMLView data={msg.mcpResult} />
                                : msg.mcpResult.tool.includes("excalidraw") && msg.mcpResult.data
                                  ? <ExcalidrawView data={msg.mcpResult} />
                                  : <MCPResultCard data={msg.mcpResult} />
                            )}

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
                        </>
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
              onCancel={cancelStreaming}
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
