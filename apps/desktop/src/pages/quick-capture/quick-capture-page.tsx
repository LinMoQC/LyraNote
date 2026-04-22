import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { FileText, Loader2, MessageSquare, Sparkles } from "lucide-react"

import { springs } from "@/lib/animations"
import { notificationShow, windowOpen } from "@/lib/desktop-bridge"
import { windowService } from "@/lib/window-service"
import { createQuickCaptureNote } from "@/services/note-service"

type CaptureMode = "note" | "chat"

export function QuickCapturePage({
  initialMode = "note",
}: {
  initialMode?: CaptureMode
}) {
  const [mode, setMode] = useState<CaptureMode>(initialMode)
  const [content, setContent] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  const description = useMemo(() => {
    return mode === "note"
      ? "把灵感快速记到全局收件箱，稍后再整理。"
      : "把想法直接丢给独立聊天窗口继续展开。"
  }, [mode])

  async function handleSubmit() {
    const trimmed = content.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    try {
      if (mode === "note") {
        const result = await createQuickCaptureNote(trimmed)
        await windowOpen("main", {
          section: "notebooks",
          showRecentImports: false,
        })
        await notificationShow({
          kind: "Quick Capture",
          title: "收件箱笔记已创建",
          body: result.title,
          route: {
            kind: "knowledge",
            section: "notebooks",
            window: "main",
          },
        })
      } else {
        await windowOpen("chat", {
          initialMessage: trimmed,
        })
      }
      await windowService.close()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col px-5 py-4" style={{ background: "var(--color-bg-base)" }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[18px] font-semibold text-[var(--color-text-primary)]">Quick Capture</p>
          <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">{description}</p>
        </div>
        <div className="rounded-2xl border px-3 py-2 text-[12px]" style={{ borderColor: "var(--color-border)" }}>
          <span className="text-[var(--color-text-tertiary)]">窗口</span>
          <span className="ml-2 text-[var(--color-text-primary)]">{windowService.label}</span>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("note")}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium transition-colors"
          style={{
            background: mode === "note" ? "var(--color-accent-muted)" : "rgba(255,255,255,0.03)",
            color: mode === "note" ? "var(--color-accent)" : "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <FileText size={14} />
          收件箱笔记
        </button>
        <button
          type="button"
          onClick={() => setMode("chat")}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium transition-colors"
          style={{
            background: mode === "chat" ? "var(--color-accent-muted)" : "rgba(255,255,255,0.03)",
            color: mode === "chat" ? "var(--color-accent)" : "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <MessageSquare size={14} />
          临时聊天
        </button>
      </div>

      <motion.textarea
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.smooth}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={mode === "note" ? "随手记下研究想法、下一步动作或待整理内容…" : "输入一段问题，发送到独立聊天窗口…"}
        className="min-h-[220px] flex-1 resize-none rounded-2xl border px-4 py-4 text-[14px] leading-6 outline-none"
        style={{
          background: "rgba(255,255,255,0.025)",
          borderColor: "var(--color-border)",
          color: "var(--color-text-primary)",
        }}
      />

      <div className="mt-4 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-[12px] text-[var(--color-text-tertiary)]">
          <Sparkles size={13} />
          {mode === "note" ? "提交后会写入本地 sidecar，再回到主窗口。" : "提交后会拉起独立聊天窗口并带入初始消息。"}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void windowService.close()}
            className="rounded-xl border px-3 py-2 text-[12px] font-medium text-[var(--color-text-secondary)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            取消
          </button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!content.trim() || submitting}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-medium text-white disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #7c6ef7, #6254e0)" }}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : mode === "note" ? <FileText size={13} /> : <MessageSquare size={13} />}
            {mode === "note" ? "保存到收件箱" : "发送到聊天"}
          </motion.button>
        </div>
      </div>
    </div>
  )
}
