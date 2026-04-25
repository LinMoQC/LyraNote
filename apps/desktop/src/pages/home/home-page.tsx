import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"
import { DesktopChatInput, type DesktopChatInputSubmitPayload } from "@/components/chat-input/desktop-chat-input"
import { springs } from "@/lib/animations"
import { useTabStore } from "@/store/use-tab-store"
import { useChatDraftStore } from "@/store/use-chat-draft-store"
import { useNavStore } from "@/store/use-nav-store"

const SUGGESTIONS = [
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "帮我分析知识库中的核心主题" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "为我的研究生成一份结构化摘要" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "对比不同来源中的相似观点" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "根据笔记内容生成学习计划" },
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 6)  return "夜深了"
  if (h < 11) return "早上好"
  if (h < 14) return "中午好"
  if (h < 18) return "下午好"
  return "晚上好"
}

export function HomePage() {
  const { openTab } = useTabStore()
  const { saveDraft } = useChatDraftStore()
  const { setActiveSection } = useNavStore()

  function handleSubmit(payload: DesktopChatInputSubmitPayload) {
    if (!payload.content.trim() && payload.attachments.length === 0) return
    const draftId = saveDraft(payload)
    openTab({ type: "chat", title: "对话", meta: { draftId } })
    setActiveSection("chat")
  }

  function handleSuggestion(s: string) {
    openTab({ type: "chat", title: "对话", meta: { initialMessage: s } })
    setActiveSection("chat")
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 pb-12 w-full">
      {/* Greeting + Avatar Area */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springs.gentle, delay: 0.05 }}
        className="flex flex-col items-center gap-4 text-center mb-8"
      >
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-white/10 bg-white/5 drop-shadow-xl">
          <img src="/bot_avatar.png" alt="AI Avatar" className="w-full h-full object-cover" />
        </div>
        <div>
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
            有什么我可以帮你的？
          </h2>
          <p className="text-[12px] mt-1.5" style={{ color: "var(--color-text-tertiary)" }}>
            {getGreeting()}，基于你的知识库，我可以帮你分析、总结和探索内容
          </p>
        </div>
      </motion.div>

      {/* Input area */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...springs.smooth, delay: 0.08 }}
        className="w-full max-w-[720px] mb-8"
      >
        <DesktopChatInput
          placeholder="向 AI 提问，或描述你想探索的内容…"
          onSubmit={handleSubmit}
        />
      </motion.div>

      {/* Suggestions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.18, duration: 0.4 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-[560px]"
      >
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.bouncy, delay: 0.2 + i * 0.05 }}
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSuggestion(s.text)}
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
    </div>
  )
}
