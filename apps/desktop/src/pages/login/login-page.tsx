import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, Eye, EyeOff, ArrowRight } from "lucide-react"
import { springs } from "@/lib/animations"
import { useAuthStore } from "@/store/use-auth-store"
import { useServerStore } from "@/store/use-server-store"
import { http } from "@/lib/http"

function UnderlineInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  type,
  autoComplete,
  suffix,
  delay,
}: {
  value: string
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder: string
  type: string
  autoComplete?: string
  suffix?: React.ReactNode
  delay: number
}) {
  const [focused, setFocused] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, ...springs.smooth }}
    >
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full h-9 text-[13px] outline-none bg-transparent pb-1"
          style={{
            color: "rgba(255,255,255,0.82)",
            caretColor: "#7c6ef7",
            paddingRight: suffix ? "2rem" : undefined,
          }}
        />
        {suffix && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 -mt-0.5">
            {suffix}
          </div>
        )}
        {/* Underline */}
        <div className="relative h-px">
          <div className="absolute inset-0" style={{ background: "rgba(255,255,255,0.12)" }} />
          <motion.div
            className="absolute inset-0"
            style={{ background: "linear-gradient(90deg, #7c6ef7, #a78bfa)", originX: 0 }}
            animate={{ scaleX: focused ? 1 : 0 }}
            transition={springs.snappy}
          />
        </div>
      </div>
    </motion.div>
  )
}

export function LoginPage() {
  const { setAuth } = useAuthStore()
  const { clearBaseUrl } = useServerStore()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!username.trim() || !password) return
    setError("")
    setLoading(true)
    try {
      const res = await http.post("/api/v1/auth/login", { username: username.trim(), password })
      const token: string = res.data.data.access_token
      const meRes = await http.get("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
      setAuth(token, meRes.data.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || "用户名或密码错误")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-[280px]">

        {/* Display title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.smooth}
          className="mb-8"
        >
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

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, ...springs.smooth }}
            className="leading-none font-bold"
            style={{ fontSize: 36, letterSpacing: "-0.03em", color: "rgba(255,255,255,0.92)" }}
          >
            欢迎回来
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.18 }}
            className="mt-2 text-[12.5px]"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            登录你的账户以继续使用
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

        {/* Fields */}
        <div className="space-y-5 mb-5">
          <UnderlineInput
            value={username}
            onChange={setUsername}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="用户名"
            type="text"
            autoComplete="username"
            delay={0.28}
          />
          <UnderlineInput
            value={password}
            onChange={setPassword}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="密码"
            type={showPwd ? "text" : "password"}
            autoComplete="current-password"
            delay={0.34}
            suffix={
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="transition-colors"
                style={{ color: "rgba(255,255,255,0.28)" }}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />
        </div>

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
          transition={{ delay: 0.4, ...springs.smooth }}
          className="flex items-center justify-between"
        >
          <button
            onClick={clearBaseUrl}
            className="text-[11px] transition-colors"
            style={{ color: "rgba(255,255,255,0.2)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
          >
            更换服务器
          </button>

          <motion.button
            whileHover={{ scale: 1.04, boxShadow: "0 6px 24px rgba(124,110,247,0.45)" }}
            whileTap={{ scale: 0.95 }}
            onClick={handleLogin}
            disabled={loading || !username.trim() || !password}
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
                <span>登录</span>
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
