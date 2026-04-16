import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, Loader2 } from "lucide-react"
import { springs } from "@/lib/animations"
import { useServerStore } from "@/store/use-server-store"
import { http } from "@/lib/http"

export function SetupPage() {
  const { setBaseUrl } = useServerStore()
  const [url, setUrl] = useState("http://localhost:8000")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)

  async function handleConnect() {
    const trimmed = url.trim()
    if (!trimmed) return
    setError("")
    setLoading(true)
    try {
      const res = await http.get("/health", { baseURL: trimmed.replace(/\/$/, ""), timeout: 5000 })
      if (res.status === 200) {
        setBaseUrl(trimmed)
      } else {
        setError("服务器响应异常，请检查地址")
      }
    } catch {
      setError("无法连接到服务器，请确认地址和网络")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-[280px]">

        {/* Display title — the visual anchor */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0, ...springs.smooth }}
          className="mb-8"
        >
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06, ...springs.smooth }}
            className="flex items-center gap-2 mb-3"
          >
            <motion.div
              className="h-px"
              style={{ background: "rgba(124,110,247,0.7)", width: 20 }}
              initial={{ scaleX: 0, originX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
            />
            <span
              className="text-[10px] font-medium tracking-[0.18em] uppercase"
              style={{ color: "rgba(124,110,247,0.8)" }}
            >
              LyraNote
            </span>
          </motion.div>

          {/* Big title */}
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, ...springs.smooth }}
            className="leading-none font-bold"
            style={{
              fontSize: 36,
              letterSpacing: "-0.03em",
              color: "rgba(255,255,255,0.92)",
            }}
          >
            连接服务器
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.18 }}
            className="mt-2 text-[12.5px]"
            style={{ color: "rgba(255,255,255,0.35)", letterSpacing: "0.01em" }}
          >
            输入后端服务地址以继续
          </motion.p>
        </motion.div>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.22, duration: 0.5, ease: "easeOut" }}
          className="mb-6 h-px"
          style={{ background: "rgba(255,255,255,0.07)" }}
        />

        {/* Underline-style input */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, ...springs.smooth }}
          className="mb-6"
        >
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="http://localhost:8000"
              className="w-full h-9 text-[13px] outline-none bg-transparent pb-1"
              style={{
                color: "rgba(255,255,255,0.82)",
                caretColor: "#7c6ef7",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.01em",
              }}
            />
            {/* Underline */}
            <div className="relative h-px">
              <div
                className="absolute inset-0"
                style={{ background: "rgba(255,255,255,0.12)" }}
              />
              <motion.div
                className="absolute inset-0"
                style={{ background: "linear-gradient(90deg, #7c6ef7, #a78bfa)", originX: 0 }}
                animate={{ scaleX: focused ? 1 : 0 }}
                transition={springs.snappy}
              />
            </div>
          </div>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={springs.snappy}
              className="overflow-hidden mb-4"
            >
              <p className="text-[11.5px]" style={{ color: "var(--color-red)" }}>
                {error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Button row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36, ...springs.smooth }}
          className="flex items-center justify-between"
        >
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>
            确保服务已启动
          </p>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleConnect}
            disabled={loading || !url.trim()}
            className="flex items-center gap-1.5 px-4 h-8 rounded-full text-[12.5px] font-medium text-white disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #7c6ef7, #6254e0)",
              boxShadow: "0 2px 12px rgba(124,110,247,0.35)",
            }}
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <>
                <span>连接</span>
                <motion.span
                  animate={{ x: [0, 2, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ArrowRight size={13} />
                </motion.span>
              </>
            )}
          </motion.button>
        </motion.div>

      </div>
    </div>
  )
}
