import { motion, AnimatePresence } from "framer-motion"
import {
  User, Key, Palette, Bell, Check, Loader2, Moon, Sun,
  Globe, Brain, Cpu, Database, Shield, Wrench, Trash2, Plus,
  ChevronDown, ChevronRight, CheckCircle2, XCircle, Pencil, X,
} from "lucide-react"
import { pageVariants, pageTransition, springs } from "@/lib/animations"
import { cn } from "@/lib/cn"
import { useState, useEffect, useCallback, useRef } from "react"
import { useAuthStore } from "@/store/use-auth-store"
import { useThemeStore } from "@/store/use-theme-store"
import { http } from "@/lib/http"

// ── Types ──────────────────────────────────────────────────────────────────

type Section =
  | "general" | "appearance" | "account" | "config"
  | "personality" | "memory" | "skills" | "mcp"
  | "storage" | "notifications" | "security"

interface ConfigData {
  llm_provider?: string
  openai_api_key?: string
  openai_base_url?: string
  llm_model?: string
  llm_utility_model?: string
  llm_utility_api_key?: string
  llm_utility_base_url?: string
  embedding_api_key?: string
  embedding_base_url?: string
  embedding_model?: string
  reranker_api_key?: string
  reranker_base_url?: string
  reranker_model?: string
  tavily_api_key?: string
  perplexity_api_key?: string
  image_gen_api_key?: string
  image_gen_base_url?: string
  image_gen_model?: string
  ai_name?: string
  user_occupation?: string
  user_preferences?: string
  custom_system_prompt?: string
  storage_backend?: string
  storage_region?: string
  storage_s3_endpoint_url?: string
  storage_s3_public_url?: string
  storage_s3_bucket?: string
  storage_s3_access_key?: string
  storage_s3_secret_key?: string
  notify_email?: string
  smtp_host?: string
  smtp_port?: number
  smtp_username?: string
  smtp_password?: string
  smtp_from?: string
}

interface MemoryItem {
  id: string
  key: string
  value: string
  memory_type: string
  confidence: number
  access_count: number
}

interface Skill {
  name: string
  display_name?: string
  description?: string
  category?: string
  is_enabled: boolean
  always: boolean
  env_satisfied: boolean
}

interface McpServer {
  id: string
  name: string
  display_name?: string
  transport: "stdio" | "http" | "sse"
  command?: string
  args?: string[]
  url?: string
  is_enabled: boolean
  discovered_tools?: { name: string; description?: string }[]
}

// ── Constants ──────────────────────────────────────────────────────────────

const SECTIONS: { id: Section; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; label: string }[] = [
  { id: "general",       icon: Globe,    label: "通用" },
  { id: "appearance",    icon: Palette,  label: "外观" },
  { id: "account",       icon: User,     label: "账号" },
  { id: "config",        icon: Key,      label: "配置" },
  { id: "personality",   icon: Brain,    label: "个性化" },
  { id: "memory",        icon: Cpu,      label: "记忆" },
  { id: "skills",        icon: Wrench,   label: "技能" },
  { id: "mcp",           icon: Wrench,   label: "MCP 工具" },
  { id: "storage",       icon: Database, label: "存储" },
  { id: "notifications", icon: Bell,     label: "通知" },
  { id: "security",      icon: Shield,   label: "安全" },
]

const SHORTCUTS = [
  { category: "全局", items: [
    { keys: ["⌘", "K"],         desc: "打开命令面板" },
    { keys: ["⌘", ","],         desc: "打开设置" },
    { keys: ["⌘", "N"],         desc: "新建笔记本" },
    { keys: ["⌘", "Shift", "F"], desc: "全局搜索" },
  ]},
  { category: "编辑器", items: [
    { keys: ["⌘", "B"],          desc: "加粗" },
    { keys: ["⌘", "I"],          desc: "斜体" },
    { keys: ["⌘", "Shift", "X"], desc: "删除线" },
    { keys: ["⌘", "`"],          desc: "行内代码" },
    { keys: ["⌘", "Z"],          desc: "撤销" },
    { keys: ["⌘", "Shift", "Z"], desc: "重做" },
  ]},
  { category: "AI 帮写", items: [
    { keys: ["⌘", "Shift", "A"], desc: "打开 / 关闭 AI 面板" },
    { keys: ["Enter"],            desc: "发送消息" },
    { keys: ["Shift", "Enter"],   desc: "换行" },
  ]},
  { category: "导航", items: [
    { keys: ["⌘", "1"], desc: "跳转主页" },
    { keys: ["⌘", "2"], desc: "跳转笔记本" },
    { keys: ["⌘", "3"], desc: "跳转知识库" },
    { keys: ["⌘", "4"], desc: "跳转对话" },
    { keys: ["⌘", "W"], desc: "关闭当前标签页" },
  ]},
]

const CATEGORY_LABELS: Record<string, string> = {
  knowledge: "知识库", web: "联网", writing: "写作", memory: "记忆", productivity: "生产力",
}

// ── Shared UI helpers ──────────────────────────────────────────────────────

function SettingRow({ label, description, children, noBorder }: {
  label: string; description?: string; children: React.ReactNode; noBorder?: boolean
}) {
  return (
    <div className={cn("flex items-center justify-between py-3.5", !noBorder && "border-b")}
      style={!noBorder ? { borderColor: "var(--color-border)" } : undefined}>
      <div className="mr-4 flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{label}</p>
        {description && <p className="text-[12px] text-[var(--color-text-tertiary)] mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn("relative rounded-full transition-colors shrink-0 disabled:opacity-40",
        checked ? "bg-[var(--color-accent)]" : "bg-white/[0.18]")}
      style={{ height: "22px", width: "40px" }}
    >
      <motion.span animate={{ x: checked ? 18 : 2 }} transition={springs.snappy}
        className="absolute top-[3px] left-0 w-4 h-4 bg-white rounded-full shadow-sm" />
    </button>
  )
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">{title}</h3>
      {description && <p className="text-[12px] text-[var(--color-text-tertiary)] mt-1">{description}</p>}
    </div>
  )
}

function FieldInput({ label, value, onChange, type = "text", placeholder, width = "w-56" }: {
  label?: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; width?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1", label && "mb-3")}>
      {label && <label className="text-[12px] text-[var(--color-text-tertiary)]">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("px-3 py-1.5 rounded-lg text-[13px] outline-none border text-[var(--color-text-primary)] focus:border-[var(--color-accent)] transition-colors", width)}
        style={{ background: "var(--color-bg-subtle)", borderColor: "var(--color-border)" }}
      />
    </div>
  )
}

function SaveButton({ onClick, saving, saved, disabled }: {
  onClick: () => void; saving?: boolean; saved?: boolean; disabled?: boolean
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={disabled || saving}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-colors mt-5 disabled:opacity-30",
        saved ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--color-accent)] text-white"
      )}
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <CheckCircle2 size={12} /> : <Check size={12} />}
      {saved ? "已保存" : "保存"}
    </motion.button>
  )
}

function CustomSelect({ value, options, onChange, width = "w-40" }: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  return (
    <div ref={ref} className={cn("relative", width)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-[30px] w-full items-center justify-between gap-2 rounded-lg border px-3 text-[13px] transition-colors outline-none",
          open ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"
        )}
        style={{ background: "var(--color-bg-subtle)", color: "var(--color-text-primary)" }}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <span className={cn("flex-shrink-0 transition-transform duration-150", open && "rotate-180")} style={{ color: "var(--color-text-tertiary)" }}>
          <ChevronDown size={12} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-xl border py-1.5"
            style={{
              background: "var(--color-bg-elevated)",
              borderColor: "var(--color-border)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
            }}
          >
            {options.map((opt) => {
              const isSel = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]",
                    "mx-1 transition-none",
                    isSel ? "font-medium" : "hover:bg-white/[0.06]"
                  )}
                  style={{
                    width: "calc(100% - 8px)",
                    background: isSel ? "rgba(99,102,241,0.15)" : undefined,
                    color: isSel ? "var(--color-accent)" : "var(--color-text-primary)",
                  }}
                >
                  <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                    {isSel && <Check size={11} />}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2 mt-8">
      {children}
    </p>
  )
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-0.5">
      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest px-2.5 py-1 mt-3 first:mt-1.5">
        {label}
      </p>
      {children}
    </div>
  )
}

function TestButton({ onClick, status, label = "测试" }: {
  onClick: () => void; status?: "idle" | "testing" | "ok" | "error"; label?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={status === "testing"}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border transition-colors shrink-0",
        status === "ok" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
          : status === "error" ? "border-red-500/30 text-red-400 bg-red-500/10"
          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.04]"
      )}
    >
      {status === "testing" ? <Loader2 size={11} className="animate-spin" />
        : status === "ok" ? <CheckCircle2 size={11} />
        : status === "error" ? <XCircle size={11} />
        : null}
      {label}
    </button>
  )
}

// ── useConfig hook (shared across config/personality/storage/notifications) ─

function useConfig() {
  const [config, setConfig] = useState<ConfigData>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    http.get("/api/v1/config").then((res) => {
      setConfig(res.data.data?.data ?? {})
    }).finally(() => setLoading(false))
  }, [])

  const patchConfig = useCallback(async (data: Partial<ConfigData>) => {
    await http.patch("/api/v1/config", { data })
    setConfig((c) => ({ ...c, ...data }))
  }, [])

  return { config, loading, patchConfig }
}

// ── Section components ──────────────────────────────────────────────────────

function GeneralSection() {
  const [lang, setLang] = useState(() => localStorage.getItem("lyra-lang") ?? "zh")
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("lyra-font-size") ?? "14")
  const [autoSave, setAutoSave] = useState(() => localStorage.getItem("lyra-autosave") !== "false")

  function save() {
    localStorage.setItem("lyra-lang", lang)
    localStorage.setItem("lyra-font-size", fontSize)
    localStorage.setItem("lyra-autosave", String(autoSave))
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`)
  }

  return (
    <>
      <SectionHeader title="通用" />
      <SettingRow label="语言" description="选择界面显示语言">
        <CustomSelect
          value={lang}
          options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }]}
          onChange={setLang}
        />
      </SettingRow>
      <SettingRow label="编辑器字体大小" description="笔记编辑区域的基础字号">
        <CustomSelect
          value={fontSize}
          options={["12", "13", "14", "15", "16", "18"].map((s) => ({ value: s, label: `${s}px` }))}
          onChange={setFontSize}
        />
      </SettingRow>
      <SettingRow label="自动保存" description="离开编辑区时自动保存草稿" noBorder>
        <Toggle checked={autoSave} onChange={setAutoSave} />
      </SettingRow>
      <SaveButton onClick={save} />
    </>
  )
}

function AppearanceSection() {
  const { isDark, toggleTheme } = useThemeStore()
  return (
    <>
      <SectionHeader title="外观" />
      <SettingRow label="主题" description="选择界面配色方案">
        <div className="flex items-center gap-1.5">
          {([{ label: "暗色", icon: Moon, val: true }, { label: "亮色", icon: Sun, val: false }] as const).map(({ label, icon: Icon, val }) => (
            <motion.button key={label} whileTap={{ scale: 0.95 }}
              onClick={() => { if (isDark !== val) toggleTheme() }}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors",
                isDark === val
                  ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)] border-[var(--color-accent)]/40"
                  : "text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-white/[0.04]")}>
              <Icon size={13} />{label}
            </motion.button>
          ))}
        </div>
      </SettingRow>
      <SettingRow label="减少动效" description="关闭页面过渡与微动效">
        <Toggle checked={false} onChange={() => {}} />
      </SettingRow>
      <SettingRow label="侧边栏默认展开" description="启动时保持侧边栏展开" noBorder>
        <Toggle checked={true} onChange={() => {}} />
      </SettingRow>

      <div className="mt-10 pt-6 border-t" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">快捷键</p>
        {SHORTCUTS.map((group) => (
          <div key={group.category} className="mb-5">
            <p className="text-[10.5px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-widest mb-1.5 opacity-60">{group.category}</p>
            {group.items.map((item, idx) => (
              <div key={item.desc} className={cn("flex items-center justify-between py-2", idx !== group.items.length - 1 && "border-b")}
                style={idx !== group.items.length - 1 ? { borderColor: "var(--color-border)" } : undefined}>
                <span className="text-[12.5px] text-[var(--color-text-secondary)]">{item.desc}</span>
                <div className="flex items-center gap-1">
                  {item.keys.map((k, ki) => (
                    <span key={ki} className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-medium border"
                      style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)", color: "var(--color-text-secondary)", minWidth: "20px" }}>
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function AccountSection() {
  const { user, setAuth, token } = useAuthStore()
  const displayName = user?.name ?? user?.username ?? "用户"
  const email = user?.email ?? ""
  const initial = displayName.charAt(0).toUpperCase()

  const [username, setUsername] = useState(user?.username ?? "")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  const [showPwd, setShowPwd] = useState(false)
  const [oldPwd, setOldPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [pwdError, setPwdError] = useState("")
  const [savingPwd, setSavingPwd] = useState(false)
  const [pwdSaved, setPwdSaved] = useState(false)

  async function handleSaveProfile() {
    if (!username.trim() || savingProfile) return
    setSavingProfile(true)
    try {
      const res = await http.patch("/api/v1/auth/profile", { username: username.trim() })
      const updated = res.data.data
      setAuth(token!, { ...user!, username: updated.username, name: updated.name ?? updated.username })
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } finally { setSavingProfile(false) }
  }

  async function handleChangePwd() {
    setPwdError("")
    if (newPwd !== confirmPwd) { setPwdError("两次输入的密码不一致"); return }
    if (newPwd.length < 6) { setPwdError("新密码至少 6 位"); return }
    setSavingPwd(true)
    try {
      await http.patch("/api/v1/auth/password", { old_password: oldPwd, new_password: newPwd })
      setPwdSaved(true)
      setOldPwd(""); setNewPwd(""); setConfirmPwd("")
      setTimeout(() => { setPwdSaved(false); setShowPwd(false) }, 2000)
    } catch {
      setPwdError("密码修改失败，请检查原密码是否正确")
    } finally { setSavingPwd(false) }
  }

  return (
    <>
      <SectionHeader title="账号" />

      {/* Profile card */}
      <div className="flex items-center gap-3.5 mb-6 p-4 rounded-xl border" style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}>
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-white/10">
          {user?.avatar_url
            ? <img src={user.avatar_url} alt={displayName} className="w-full h-full object-cover" />
            : <span className="text-white text-[15px] font-bold">{initial}</span>}
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{displayName}</p>
          <p className="text-[12px] text-[var(--color-text-tertiary)]">{email || "本地账号"}</p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/12 text-violet-400 border border-violet-500/20 shrink-0">个人版</span>
      </div>

      <GroupLabel>基本信息</GroupLabel>
      <SettingRow label="用户名" description="公开显示的名称">
        <div className="flex items-center gap-2">
          <input className="px-3 py-1.5 rounded-lg text-[13px] outline-none border text-[var(--color-text-primary)] focus:border-[var(--color-accent)] transition-colors w-36"
            style={{ background: "var(--color-bg-subtle)", borderColor: "var(--color-border)" }}
            value={username} onChange={(e) => { setUsername(e.target.value); setProfileSaved(false) }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveProfile() }} />
          <motion.button whileTap={{ scale: 0.92 }} onClick={handleSaveProfile}
            disabled={savingProfile || !username.trim() || username === user?.username}
            className={cn("flex items-center justify-center w-7 h-7 rounded-lg border transition-colors",
              profileSaved ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.04] disabled:opacity-30")}>
            {savingProfile ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          </motion.button>
        </div>
      </SettingRow>
      <SettingRow label="邮箱" noBorder>
        <span className="text-[13px] text-[var(--color-text-tertiary)]">{email || "—"}</span>
      </SettingRow>

      <GroupLabel>修改密码</GroupLabel>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
        <button onClick={() => setShowPwd((v) => !v)}
          className="flex items-center justify-between w-full px-4 py-2.5 text-[13px] text-[var(--color-text-secondary)] hover:bg-white/[0.03] transition-colors">
          <span>修改账号密码</span>
          {showPwd ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <motion.div
          initial={false}
          animate={{ gridTemplateRows: showPwd ? "1fr" : "0fr" }}
          transition={{ duration: 0.28, ease: [0.25, 0, 0, 1] }}
          style={{ display: "grid", overflow: "hidden" }}
        >
          <motion.div
            initial={false}
            animate={{ opacity: showPwd ? 1 : 0 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: showPwd ? 0.06 : 0 }}
            style={{ minHeight: 0 }}
          >
            <div className="border-t px-4 py-4 flex flex-col gap-3" style={{ borderColor: "var(--color-border)" }}>
              <FieldInput label="当前密码" value={oldPwd} onChange={setOldPwd} type="password" placeholder="请输入当前密码" width="w-full" />
              <FieldInput label="新密码" value={newPwd} onChange={setNewPwd} type="password" placeholder="至少 6 位" width="w-full" />
              <FieldInput label="确认新密码" value={confirmPwd} onChange={setConfirmPwd} type="password" placeholder="再次输入新密码" width="w-full" />
              {pwdError && <p className="text-[12px] text-red-400">{pwdError}</p>}
              {pwdSaved && <p className="text-[12px] text-emerald-400">密码修改成功</p>}
              <motion.button whileTap={{ scale: 0.95 }} onClick={handleChangePwd} disabled={savingPwd || !oldPwd || !newPwd || !confirmPwd}
                className="self-start px-4 py-2 rounded-lg text-[12px] font-medium bg-[var(--color-accent)] text-white disabled:opacity-30 transition-opacity">
                {savingPwd ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null}确认修改
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="mt-6">
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => useAuthStore.getState().clearAuth()}
          className="px-4 py-2 rounded-lg text-[12px] font-medium border border-red-500/25 text-red-400 hover:bg-red-500/8 transition-colors">
          退出登录
        </motion.button>
      </div>
    </>
  )
}

function ConfigAccordion({ id, title, children, expanded, setExpanded }: {
  id: string; title: string; children: React.ReactNode
  expanded: Record<string, boolean>
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
}) {
  const open = expanded[id] ?? false
  return (
    <div className="rounded-xl border overflow-hidden mb-3" style={{ borderColor: "var(--color-border)" }}>
      <button onClick={() => setExpanded((e) => ({ ...e, [id]: !open }))}
        className="flex items-center justify-between w-full px-4 py-2.5 text-[13px] font-medium text-[var(--color-text-primary)] hover:bg-white/[0.03] transition-colors">
        {title}{open ? <ChevronDown size={14} className="text-[var(--color-text-tertiary)]" /> : <ChevronRight size={14} className="text-[var(--color-text-tertiary)]" />}
      </button>
      <motion.div
        initial={false}
        animate={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        transition={{ duration: 0.28, ease: [0.25, 0, 0, 1] }}
        style={{ display: "grid", overflow: "hidden" }}
      >
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut", delay: open ? 0.06 : 0 }}
          style={{ minHeight: 0 }}
        >
          <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "var(--color-border)" }}>
            {children}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

function ConfigSection() {
  const { config, loading, patchConfig } = useConfig()
  const [form, setForm] = useState<ConfigData>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<Record<string, "idle" | "testing" | "ok" | "error">>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ main: true, embedding: true })

  useEffect(() => { setForm(config) }, [config])

  function set(k: keyof ConfigData, v: string | number) { setForm((f) => ({ ...f, [k]: v })); setSaved(false) }

  async function handleSave() {
    setSaving(true)
    try { await patchConfig(form); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    finally { setSaving(false) }
  }

  async function test(endpoint: string, key: string) {
    setTestStatus((s) => ({ ...s, [key]: "testing" }))
    try {
      const res = await http.post(`/api/v1/config/test-${endpoint}`)
      setTestStatus((s) => ({ ...s, [key]: res.data.data?.ok ? "ok" : "error" }))
    } catch { setTestStatus((s) => ({ ...s, [key]: "error" })) }
  }


  if (loading) return <div className="flex justify-center pt-12"><Loader2 size={18} className="animate-spin text-[var(--color-text-tertiary)]" /></div>

  return (
    <>
      <SectionHeader title="配置" description="AI 模型与 API 密钥设置" />

      <ConfigAccordion expanded={expanded} setExpanded={setExpanded}id="main" title="主模型">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] text-[var(--color-text-tertiary)] mb-1 block">Provider</label>
            <CustomSelect
              value={form.llm_provider ?? "openai"}
              options={[{ value: "openai", label: "OpenAI" }, { value: "anthropic", label: "Anthropic" }, { value: "litellm", label: "LiteLLM" }]}
              onChange={(v) => set("llm_provider", v)}
              width="w-full"
            />
          </div>
          <FieldInput label="API Key" value={form.openai_api_key ?? ""} onChange={(v) => set("openai_api_key", v)} type="password" placeholder="sk-..." width="w-full" />
          <FieldInput label="Base URL（可选）" value={form.openai_base_url ?? ""} onChange={(v) => set("openai_base_url", v)} placeholder="https://api.openai.com/v1" width="w-full" />
          <FieldInput label="模型名称（可选）" value={form.llm_model ?? ""} onChange={(v) => set("llm_model", v)} placeholder="gpt-4o" width="w-full" />
          <div className="flex justify-end">
            <TestButton onClick={() => test("llm", "llm")} status={testStatus.llm} label="测试连接" />
          </div>
        </div>
      </ConfigAccordion>

      <ConfigAccordion expanded={expanded} setExpanded={setExpanded}id="embedding" title="嵌入模型">
        <div className="flex flex-col gap-3">
          <FieldInput label="API Key" value={form.embedding_api_key ?? ""} onChange={(v) => set("embedding_api_key", v)} type="password" placeholder="sk-..." width="w-full" />
          <FieldInput label="Base URL（可选）" value={form.embedding_base_url ?? ""} onChange={(v) => set("embedding_base_url", v)} placeholder="https://api.openai.com/v1" width="w-full" />
          <FieldInput label="模型名称（可选）" value={form.embedding_model ?? ""} onChange={(v) => set("embedding_model", v)} placeholder="text-embedding-3-small" width="w-full" />
          <div className="flex justify-end">
            <TestButton onClick={() => test("embedding", "embedding")} status={testStatus.embedding} label="测试连接" />
          </div>
        </div>
      </ConfigAccordion>

      <ConfigAccordion expanded={expanded} setExpanded={setExpanded}id="utility" title="工具模型（小型 / 快速）">
        <div className="flex flex-col gap-3">
          <FieldInput label="模型名称" value={form.llm_utility_model ?? ""} onChange={(v) => set("llm_utility_model", v)} placeholder="gpt-4o-mini" width="w-full" />
          <FieldInput label="API Key（可选）" value={form.llm_utility_api_key ?? ""} onChange={(v) => set("llm_utility_api_key", v)} type="password" placeholder="与主模型共用时留空" width="w-full" />
          <FieldInput label="Base URL（可选）" value={form.llm_utility_base_url ?? ""} onChange={(v) => set("llm_utility_base_url", v)} width="w-full" />
        </div>
      </ConfigAccordion>

      <ConfigAccordion expanded={expanded} setExpanded={setExpanded}id="search" title="搜索增强">
        <div className="flex flex-col gap-3">
          <FieldInput label="Tavily API Key" value={form.tavily_api_key ?? ""} onChange={(v) => set("tavily_api_key", v)} type="password" placeholder="tvly-..." width="w-full" />
          <FieldInput label="Perplexity API Key" value={form.perplexity_api_key ?? ""} onChange={(v) => set("perplexity_api_key", v)} type="password" placeholder="pplx-..." width="w-full" />
        </div>
      </ConfigAccordion>

      <ConfigAccordion expanded={expanded} setExpanded={setExpanded}id="reranker" title="Reranker（可选）">
        <div className="flex flex-col gap-3">
          <FieldInput label="API Key" value={form.reranker_api_key ?? ""} onChange={(v) => set("reranker_api_key", v)} type="password" width="w-full" />
          <FieldInput label="Base URL" value={form.reranker_base_url ?? ""} onChange={(v) => set("reranker_base_url", v)} width="w-full" />
          <FieldInput label="模型名称" value={form.reranker_model ?? ""} onChange={(v) => set("reranker_model", v)} placeholder="rerank-multilingual-v3.0" width="w-full" />
          <div className="flex justify-end">
            <TestButton onClick={() => test("reranker", "reranker")} status={testStatus.reranker} label="测试连接" />
          </div>
        </div>
      </ConfigAccordion>

      <ConfigAccordion expanded={expanded} setExpanded={setExpanded}id="imagegen" title="图片生成（可选）">
        <div className="flex flex-col gap-3">
          <FieldInput label="API Key" value={form.image_gen_api_key ?? ""} onChange={(v) => set("image_gen_api_key", v)} type="password" width="w-full" />
          <FieldInput label="Base URL" value={form.image_gen_base_url ?? ""} onChange={(v) => set("image_gen_base_url", v)} width="w-full" />
          <FieldInput label="模型名称" value={form.image_gen_model ?? ""} onChange={(v) => set("image_gen_model", v)} placeholder="dall-e-3" width="w-full" />
        </div>
      </ConfigAccordion>

      <SaveButton onClick={handleSave} saving={saving} saved={saved} />
    </>
  )
}

function PersonalitySection() {
  const { config, loading, patchConfig } = useConfig()
  const [form, setForm] = useState({ ai_name: "", user_occupation: "", user_preferences: "", custom_system_prompt: "" })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setForm({
      ai_name: config.ai_name ?? "",
      user_occupation: config.user_occupation ?? "",
      user_preferences: config.user_preferences ?? "",
      custom_system_prompt: config.custom_system_prompt ?? "",
    })
  }, [config])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })); setSaved(false) }

  async function handleSave() {
    setSaving(true)
    try { await patchConfig(form); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center pt-12"><Loader2 size={18} className="animate-spin text-[var(--color-text-tertiary)]" /></div>

  return (
    <>
      <SectionHeader title="个性化" description="自定义 AI 助手的行为方式" />
      <SettingRow label="AI 助手名称" description="AI 的称呼（默认 Lyra）">
        <input value={form.ai_name} onChange={(e) => set("ai_name", e.target.value)} placeholder="Lyra"
          className="px-3 py-1.5 rounded-lg text-[13px] outline-none border w-36 text-[var(--color-text-primary)] focus:border-[var(--color-accent)] transition-colors bg-[var(--color-bg-subtle)] border-[var(--color-border)]" />
      </SettingRow>
      <SettingRow label="职业 / 角色" description="帮助 AI 更好地理解你的背景">
        <input value={form.user_occupation} onChange={(e) => set("user_occupation", e.target.value)} placeholder="研究员、工程师..."
          className="px-3 py-1.5 rounded-lg text-[13px] outline-none border w-40 text-[var(--color-text-primary)] focus:border-[var(--color-accent)] transition-colors bg-[var(--color-bg-subtle)] border-[var(--color-border)]" />
      </SettingRow>
      <SettingRow label="兴趣偏好" description="你感兴趣的领域或话题" noBorder>
        <input value={form.user_preferences} onChange={(e) => set("user_preferences", e.target.value)} placeholder="AI、哲学、文学..."
          className="px-3 py-1.5 rounded-lg text-[13px] outline-none border w-40 text-[var(--color-text-primary)] focus:border-[var(--color-accent)] transition-colors bg-[var(--color-bg-subtle)] border-[var(--color-border)]" />
      </SettingRow>

      <GroupLabel>自定义系统提示词</GroupLabel>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
        <textarea value={form.custom_system_prompt} onChange={(e) => set("custom_system_prompt", e.target.value)}
          rows={6} placeholder="在此输入对 AI 行为的额外要求，例如：请始终使用简洁的中文回答..."
          className="w-full bg-transparent outline-none resize-none text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] p-4 leading-relaxed"
          style={{ fontFamily: "var(--font-sans)" }} />
      </div>
      <SaveButton onClick={handleSave} saving={saving} saved={saved} />
    </>
  )
}

function MemorySection() {
  const [tab, setTab] = useState<"structured" | "doc">("structured")
  const [memories, setMemories] = useState<Record<string, MemoryItem[]>>({})
  const [docContent, setDocContent] = useState("")
  const [docUpdatedAt, setDocUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [savingDoc, setSavingDoc] = useState(false)
  const [docSaved, setDocSaved] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)

  function loadMemories() {
    setLoading(true)
    http.get("/api/v1/memory")
      .then((r) => setMemories(r.data.data ?? {}))
      .catch(() => setMemories({}))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadMemories()

    http.get("/api/v1/memory/doc")
      .then((r) => {
        setDocContent(r.data.data?.content_md ?? "")
        setDocUpdatedAt(r.data.data?.updated_at ?? null)
      })
      .catch(() => {})
  }, [])

  async function handleEdit(id: string) {
    try {
      await http.put(`/api/v1/memory/${id}`, { value: editValue })
      setMemories((m) => {
        const next = { ...m }
        for (const type of Object.keys(next)) {
          next[type] = next[type].map((item) => item.id === id ? { ...item, value: editValue } : item)
        }
        return next
      })
      setEditingId(null)
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    try {
      await http.delete(`/api/v1/memory/${id}`)
      setMemories((m) => {
        const next = { ...m }
        for (const type of Object.keys(next)) {
          next[type] = next[type].filter((item) => item.id !== id)
        }
        return next
      })
    } catch { /* ignore */ }
  }

  async function handleSaveDoc() {
    setSavingDoc(true)
    try {
      await http.patch("/api/v1/memory/doc", { content_md: docContent })
      setDocSaved(true); setTimeout(() => setDocSaved(false), 2000)
    } finally { setSavingDoc(false) }
  }

  async function handleBackfill() {
    setBackfilling(true)
    setBackfillMsg(null)
    try {
      const res = await http.post("/api/v1/memory/backfill")
      setBackfillMsg(res.data.data?.message ?? "后台处理中，稍后刷新查看")
      setTimeout(() => {
        loadMemories()
        setBackfillMsg(null)
      }, 5000)
    } catch {
      setBackfillMsg("扫描失败，请稍后重试")
    } finally {
      setBackfilling(false)
    }
  }

  const TYPE_LABELS: Record<string, string> = { preference: "偏好", fact: "事实", skill: "技能" }

  return (
    <>
      <SectionHeader title="记忆" description="AI 从对话中学习到的关于你的信息" />
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1.5">
          {(["structured", "doc"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                tab === t ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:bg-white/[0.04]")}>
              {t === "structured" ? "结构化记忆" : "记忆文档"}
            </button>
          ))}
        </div>
        {tab === "structured" && (
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.04] transition-colors disabled:opacity-40"
          >
            {backfilling ? <Loader2 size={11} className="animate-spin" /> : null}
            重新扫描对话
          </button>
        )}
      </div>
      {backfillMsg && (
        <p className="text-[12px] text-[var(--color-text-tertiary)] mb-4">{backfillMsg}</p>
      )}

      {loading ? (
        <div className="flex justify-center pt-8"><Loader2 size={18} className="animate-spin text-[var(--color-text-tertiary)]" /></div>
      ) : tab === "structured" ? (
        <div className="flex flex-col gap-5">
          {Object.values(memories).every((items) => items.length === 0)
            ? <p className="text-[13px] text-[var(--color-text-tertiary)]">暂无结构化记忆</p>
            : Object.entries(memories).map(([type, items]) => items.length > 0 && (
              <div key={type}>
                <GroupLabel>{TYPE_LABELS[type] ?? type}</GroupLabel>
                <div className="flex flex-col gap-2">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl border" style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-[var(--color-text-tertiary)] mb-1">{item.key}</p>
                        {editingId === item.id ? (
                          <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleEdit(item.id); if (e.key === "Escape") setEditingId(null) }}
                            className="w-full bg-transparent outline-none text-[13px] text-[var(--color-text-primary)] border-b border-[var(--color-accent)] pb-0.5" />
                        ) : (
                          <p className="text-[13px] text-[var(--color-text-primary)] truncate">{item.value}</p>
                        )}
                        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">置信度 {Math.round(item.confidence * 100)}% · 访问 {item.access_count} 次</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {editingId === item.id ? (
                          <>
                            <button onClick={() => handleEdit(item.id)} className="w-6 h-6 flex items-center justify-center rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors"><Check size={12} /></button>
                            <button onClick={() => setEditingId(null)} className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-white/5 transition-colors"><X size={12} /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(item.id); setEditValue(item.value) }} className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-white/5 transition-colors"><Pencil size={11} /></button>
                            <button onClick={() => handleDelete(item.id)} className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={11} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          }
        </div>
      ) : (
        <>
          {docUpdatedAt && <p className="text-[11px] text-[var(--color-text-tertiary)] mb-3">最后更新：{new Date(docUpdatedAt).toLocaleString("zh-CN")}</p>}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <textarea value={docContent} onChange={(e) => setDocContent(e.target.value)} rows={14}
              placeholder="在此记录关于你的长期背景信息，AI 会在每次对话中参考这些内容..."
              className="w-full bg-transparent outline-none resize-none text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] p-4 leading-relaxed"
              style={{ fontFamily: "var(--font-sans)" }} />
          </div>
          <SaveButton onClick={handleSaveDoc} saving={savingDoc} saved={docSaved} />
        </>
      )}
    </>
  )
}

function SkillsSection() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    http.get("/api/v1/skills").then((r) => setSkills(r.data.data ?? [])).finally(() => setLoading(false))
  }, [])

  async function handleToggle(name: string, current: boolean) {
    setToggling(name)
    try {
      await http.put(`/api/v1/skills/${name}`, { is_enabled: !current })
      setSkills((s) => s.map((sk) => sk.name === name ? { ...sk, is_enabled: !current } : sk))
    } finally { setToggling(null) }
  }

  const grouped = skills.reduce<Record<string, Skill[]>>((acc, sk) => {
    const cat = sk.category ?? "other"
    ;(acc[cat] ??= []).push(sk)
    return acc
  }, {})

  return (
    <>
      <SectionHeader title="技能" description="管理 AI 助手的能力模块" />
      {loading ? (
        <div className="flex justify-center pt-8"><Loader2 size={18} className="animate-spin text-[var(--color-text-tertiary)]" /></div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="mb-5">
            <GroupLabel>{CATEGORY_LABELS[cat] ?? cat}</GroupLabel>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              {items.map((sk, idx) => (
                <div key={sk.name} className={cn("flex items-center justify-between px-4 py-3", idx !== items.length - 1 && "border-b")}
                  style={idx !== items.length - 1 ? { borderColor: "var(--color-border)" } : undefined}>
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{sk.display_name ?? sk.name}</span>
                      {sk.always && <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-500/12 text-violet-400">核心</span>}
                      {!sk.env_satisfied && <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/12 text-amber-400">缺少配置</span>}
                    </div>
                    {sk.description && <p className="text-[12px] text-[var(--color-text-tertiary)] mt-0.5 truncate">{sk.description}</p>}
                  </div>
                  {toggling === sk.name
                    ? <Loader2 size={14} className="animate-spin text-[var(--color-text-tertiary)] shrink-0" />
                    : <Toggle checked={sk.is_enabled} onChange={() => handleToggle(sk.name, sk.is_enabled)} disabled={sk.always} />}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  )
}

function McpSection() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, "ok" | "error">>({})
  const [newServer, setNewServer] = useState<Partial<McpServer>>({ transport: "stdio", is_enabled: true })
  const [editServer, setEditServer] = useState<Partial<McpServer>>({})

  useEffect(() => {
    http.get("/api/v1/mcp/servers").then((r) => setServers(r.data.data ?? [])).finally(() => setLoading(false))
  }, [])

  async function handleAdd() {
    try {
      const res = await http.post("/api/v1/mcp/servers", newServer)
      setServers((s) => [...s, res.data.data])
      setShowAdd(false)
      setNewServer({ transport: "stdio", is_enabled: true })
    } catch { /* ignore */ }
  }

  async function handleEdit(id: string) {
    try {
      const res = await http.patch(`/api/v1/mcp/servers/${id}`, editServer)
      setServers((s) => s.map((sv) => sv.id === id ? { ...sv, ...res.data.data } : sv))
      setEditingId(null)
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    try {
      await http.delete(`/api/v1/mcp/servers/${id}`)
      setServers((s) => s.filter((sv) => sv.id !== id))
    } catch { /* ignore */ }
  }

  async function handleToggle(id: string, current: boolean) {
    try {
      await http.patch(`/api/v1/mcp/servers/${id}`, { is_enabled: !current })
      setServers((s) => s.map((sv) => sv.id === id ? { ...sv, is_enabled: !current } : sv))
    } catch { /* ignore */ }
  }

  async function handleTest(id: string) {
    setTesting(id)
    try {
      const res = await http.post(`/api/v1/mcp/servers/${id}/test`)
      const ok = res.data.data?.ok
      setTestResults((t) => ({ ...t, [id]: ok ? "ok" : "error" }))
      if (ok && res.data.data?.tools) {
        setServers((s) => s.map((sv) => sv.id === id ? { ...sv, discovered_tools: res.data.data.tools } : sv))
      }
    } catch {
      setTestResults((t) => ({ ...t, [id]: "error" }))
    } finally { setTesting(null) }
  }

  function startEdit(sv: McpServer) {
    setEditingId(sv.id)
    setEditServer({ display_name: sv.display_name, command: sv.command, url: sv.url, transport: sv.transport })
  }

  const ServerForm = ({ value, onChange, onSubmit, onCancel, submitLabel }: {
    value: Partial<McpServer>
    onChange: (v: Partial<McpServer>) => void
    onSubmit: () => void
    onCancel: () => void
    submitLabel: string
  }) => (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <FieldInput label="名称" value={(value as { name?: string }).name ?? value.display_name ?? ""} onChange={(v) => onChange({ ...value, name: v, display_name: v })} placeholder="my-tool" width="w-full" />
        </div>
        <div>
          <label className="text-[12px] text-[var(--color-text-tertiary)] mb-1 block">传输方式</label>
          <CustomSelect
            value={value.transport ?? "stdio"}
            options={[{ value: "stdio", label: "stdio" }, { value: "http", label: "http" }, { value: "sse", label: "sse" }]}
            onChange={(v) => onChange({ ...value, transport: v as McpServer["transport"] })}
          />
        </div>
      </div>
      {value.transport === "stdio" || !value.transport
        ? <FieldInput label="命令" value={value.command ?? ""} onChange={(v) => onChange({ ...value, command: v })} placeholder="npx -y @modelcontextprotocol/server-..." width="w-full" />
        : <FieldInput label="URL" value={value.url ?? ""} onChange={(v) => onChange({ ...value, url: v })} placeholder="http://localhost:3000" width="w-full" />
      }
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--color-text-secondary)] hover:bg-white/[0.04] transition-colors">取消</button>
        <motion.button whileTap={{ scale: 0.95 }} onClick={onSubmit}
          disabled={!(value.command ?? value.url ?? (value as { name?: string }).name)}
          className="px-4 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-accent)] text-white disabled:opacity-30 transition-opacity">
          {submitLabel}
        </motion.button>
      </div>
    </div>
  )

  return (
    <>
      <SectionHeader title="MCP 工具" description="Model Context Protocol 外部工具服务" />

      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">MCP 服务器</span>
          {servers.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
              style={{ background: "var(--color-accent-muted)", color: "var(--color-accent)" }}>
              {servers.length}
            </span>
          )}
        </div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setShowAdd(true); setNewServer({ transport: "stdio", is_enabled: true }) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)", background: "transparent" }}>
          <Plus size={12} />添加服务器
        </motion.button>
      </div>

      <p className="text-[12px] text-[var(--color-text-tertiary)] mb-4">
        配置外部 MCP 工具服务器，AI 助手将在对话时自动发现并调用其中的工具。
      </p>

      {loading ? (
        <div className="flex justify-center pt-8"><Loader2 size={18} className="animate-spin text-[var(--color-text-tertiary)]" /></div>
      ) : (
        <>
          {servers.length === 0 && !showAdd && (
            <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed" style={{ borderColor: "var(--color-border)" }}>
              <Wrench size={22} className="text-[var(--color-text-tertiary)] mb-2" />
              <p className="text-[13px] text-[var(--color-text-tertiary)]">暂未配置任何 MCP 服务</p>
            </div>
          )}

          {/* Add modal */}
          <AnimatePresence>
            {showAdd && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 flex items-center justify-center"
                style={{ backdropFilter: "blur(4px)", background: "rgba(0,0,0,0.5)" }}
                onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false) }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={springs.snappy}
                  className="w-full max-w-md rounded-2xl border p-5 shadow-2xl"
                  style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">添加 MCP 服务器</h3>
                    <button
                      onClick={() => setShowAdd(false)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-white/[0.06] hover:text-[var(--color-text-secondary)] transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <ServerForm
                    value={newServer}
                    onChange={setNewServer}
                    onSubmit={handleAdd}
                    onCancel={() => setShowAdd(false)}
                    submitLabel="添加"
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Server cards */}
          <div className="flex flex-col gap-2.5">
            {servers.map((sv) => (
              <div key={sv.id} className="rounded-xl border overflow-hidden"
                style={{ background: "var(--color-bg-elevated)", borderColor: editingId === sv.id ? "var(--color-accent)" : "var(--color-border)", borderWidth: editingId === sv.id ? 1.5 : 1 }}>

                {editingId === sv.id ? (
                  <div className="p-4">
                    <ServerForm
                      value={editServer}
                      onChange={setEditServer}
                      onSubmit={() => handleEdit(sv.id)}
                      onCancel={() => setEditingId(null)}
                      submitLabel="保存"
                    />
                  </div>
                ) : (
                  <div className="p-3.5">
                    {/* Top row: name + badges */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{sv.display_name ?? sv.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] border"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-tertiary)" }}>
                        {sv.transport}
                      </span>
                      {!sv.is_enabled && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-[var(--color-text-tertiary)]">已禁用</span>
                      )}
                    </div>

                    {/* Command / URL */}
                    <p className="text-[11px] text-[var(--color-text-tertiary)] mb-2 font-mono truncate">{sv.command ?? sv.url}</p>

                    {/* Discovered tool chips */}
                    {sv.discovered_tools && sv.discovered_tools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {sv.discovered_tools.map((t) => (
                          <span key={t.name}
                            className="px-2 py-0.5 rounded-full text-[11px] font-mono"
                            style={{ background: "rgba(99,102,241,0.12)", color: "var(--color-accent)" }}
                            title={t.description}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Action row */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleTest(sv.id)} disabled={testing === sv.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition-colors"
                        style={{
                          borderColor: testResults[sv.id] === "ok" ? "rgba(52,211,153,0.3)"
                            : testResults[sv.id] === "error" ? "rgba(248,113,113,0.3)"
                            : "var(--color-border)",
                          color: testResults[sv.id] === "ok" ? "rgb(52,211,153)"
                            : testResults[sv.id] === "error" ? "rgb(248,113,113)"
                            : "var(--color-text-secondary)",
                        }}>
                        {testing === sv.id ? <Loader2 size={11} className="animate-spin" />
                          : testResults[sv.id] === "ok" ? <CheckCircle2 size={11} />
                          : testResults[sv.id] === "error" ? <XCircle size={11} />
                          : null}
                        测试
                      </button>

                      <button onClick={() => startEdit(sv)}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-white/[0.06] hover:text-[var(--color-text-secondary)] transition-colors">
                        <Pencil size={11} />
                      </button>

                      <button onClick={() => handleDelete(sv.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 size={11} />
                      </button>

                      <div className="ml-auto">
                        <Toggle checked={sv.is_enabled} onChange={() => handleToggle(sv.id, sv.is_enabled)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function StorageSection() {
  const { config, loading, patchConfig } = useConfig()
  const [backend, setBackend] = useState("local")
  const [form, setForm] = useState<ConfigData>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setBackend(config.storage_backend ?? "local")
    setForm(config)
  }, [config])

  function set(k: keyof ConfigData, v: string) { setForm((f) => ({ ...f, [k]: v })); setSaved(false) }

  async function handleSave() {
    setSaving(true)
    try { await patchConfig({ ...form, storage_backend: backend }); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center pt-12"><Loader2 size={18} className="animate-spin text-[var(--color-text-tertiary)]" /></div>

  return (
    <>
      <SectionHeader title="存储" description="文件与附件的存储后端配置" />
      <SettingRow label="存储后端" description="选择文件存储方式">
        <CustomSelect
          value={backend}
          options={[
            { value: "local", label: "本地存储" },
            { value: "minio", label: "MinIO（自托管）" },
            { value: "s3", label: "AWS S3" },
            { value: "oss", label: "阿里云 OSS" },
            { value: "cos", label: "腾讯云 COS" },
          ]}
          onChange={(v) => { setBackend(v); setSaved(false) }}
          width="w-44"
        />
      </SettingRow>

      {backend !== "local" && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={springs.snappy} className="mt-3">
          <div className="rounded-xl border overflow-hidden p-4 flex flex-col gap-3" style={{ borderColor: "var(--color-border)" }}>
            <FieldInput label="Bucket 名称" value={form.storage_s3_bucket ?? ""} onChange={(v) => set("storage_s3_bucket", v)} placeholder="my-bucket" width="w-full" />
            <FieldInput label="Region" value={form.storage_region ?? ""} onChange={(v) => set("storage_region", v)} placeholder="us-east-1" width="w-full" />
            <FieldInput label="Endpoint URL" value={form.storage_s3_endpoint_url ?? ""} onChange={(v) => set("storage_s3_endpoint_url", v)} placeholder="https://s3.amazonaws.com" width="w-full" />
            {backend === "minio" && <FieldInput label="公开访问 URL" value={form.storage_s3_public_url ?? ""} onChange={(v) => set("storage_s3_public_url", v)} placeholder="https://minio.example.com" width="w-full" />}
            <FieldInput label="Access Key" value={form.storage_s3_access_key ?? ""} onChange={(v) => set("storage_s3_access_key", v)} type="password" width="w-full" />
            <FieldInput label="Secret Key" value={form.storage_s3_secret_key ?? ""} onChange={(v) => set("storage_s3_secret_key", v)} type="password" width="w-full" />
          </div>
        </motion.div>
      )}
      <SaveButton onClick={handleSave} saving={saving} saved={saved} />
    </>
  )
}

function NotificationsSection() {
  const { config, loading, patchConfig } = useConfig()
  const [notifTaskDone, setNotifTaskDone] = useState(true)
  const [notifResearch, setNotifResearch] = useState(true)
  const [notifInsight, setNotifInsight] = useState(false)
  const [notifSound, setNotifSound] = useState(true)
  const [smtpForm, setSmtpForm] = useState({ notify_email: "", smtp_host: "", smtp_port: "465", smtp_username: "", smtp_password: "", smtp_from: "" })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null)

  useEffect(() => {
    setSmtpForm({
      notify_email: config.notify_email ?? "",
      smtp_host: config.smtp_host ?? "",
      smtp_port: String(config.smtp_port ?? 465),
      smtp_username: config.smtp_username ?? "",
      smtp_password: config.smtp_password ?? "",
      smtp_from: config.smtp_from ?? "",
    })
  }, [config])

  function setSmtp(k: keyof typeof smtpForm, v: string) { setSmtpForm((f) => ({ ...f, [k]: v })); setSaved(false) }

  async function handleSave() {
    setSaving(true)
    try {
      await patchConfig({ ...smtpForm, smtp_port: Number(smtpForm.smtp_port) })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  async function handleTestEmail() {
    setTesting(true); setTestResult(null)
    try {
      const res = await http.post("/api/v1/config/test-email")
      setTestResult(res.data.data?.ok ? "ok" : "error")
    } catch { setTestResult("error") }
    finally { setTesting(false) }
  }

  return (
    <>
      <SectionHeader title="通知" description="应用内通知与邮件提醒" />

      <GroupLabel>应用内通知</GroupLabel>
      <SettingRow label="定时任务完成" description="定时研究任务执行完毕后通知"><Toggle checked={notifTaskDone} onChange={setNotifTaskDone} /></SettingRow>
      <SettingRow label="深度研究完成" description="深度研究报告生成完毕后通知"><Toggle checked={notifResearch} onChange={setNotifResearch} /></SettingRow>
      <SettingRow label="主动洞察推送" description="AI 发现知识关联时通知"><Toggle checked={notifInsight} onChange={setNotifInsight} /></SettingRow>
      <SettingRow label="通知音效" description="收到通知时播放提示音" noBorder><Toggle checked={notifSound} onChange={setNotifSound} /></SettingRow>

      <GroupLabel>邮件通知（SMTP）</GroupLabel>
      {loading ? <Loader2 size={14} className="animate-spin text-[var(--color-text-tertiary)]" /> : (
        <div className="rounded-xl border overflow-hidden p-4 flex flex-col gap-3" style={{ borderColor: "var(--color-border)" }}>
          <FieldInput label="收件邮箱" value={smtpForm.notify_email} onChange={(v) => setSmtp("notify_email", v)} placeholder="you@example.com" width="w-full" />
          <div className="flex gap-3">
            <div className="flex-1"><FieldInput label="SMTP 主机" value={smtpForm.smtp_host} onChange={(v) => setSmtp("smtp_host", v)} placeholder="smtp.example.com" width="w-full" /></div>
            <div className="w-24"><FieldInput label="端口" value={smtpForm.smtp_port} onChange={(v) => setSmtp("smtp_port", v)} placeholder="465" width="w-full" /></div>
          </div>
          <FieldInput label="SMTP 用户名" value={smtpForm.smtp_username} onChange={(v) => setSmtp("smtp_username", v)} width="w-full" />
          <FieldInput label="SMTP 密码" value={smtpForm.smtp_password} onChange={(v) => setSmtp("smtp_password", v)} type="password" width="w-full" />
          <FieldInput label="发件地址（From）" value={smtpForm.smtp_from} onChange={(v) => setSmtp("smtp_from", v)} placeholder="LyraNote <noreply@example.com>" width="w-full" />
          <div className="flex items-center gap-3">
            <TestButton onClick={handleTestEmail} status={testing ? "testing" : testResult ?? "idle"} label="发送测试邮件" />
            {testResult === "ok" && <span className="text-[12px] text-emerald-400">测试邮件已发送</span>}
            {testResult === "error" && <span className="text-[12px] text-red-400">发送失败，请检查配置</span>}
          </div>
        </div>
      )}
      <SaveButton onClick={handleSave} saving={saving} saved={saved} />
    </>
  )
}

function SecuritySection() {
  const { user } = useAuthStore()
  const email = user?.email ?? ""

  return (
    <>
      <SectionHeader title="安全" description="账号安全与登录管理" />
      <GroupLabel>当前会话</GroupLabel>
      <SettingRow label="登录账号">
        <span className="text-[13px] text-[var(--color-text-tertiary)]">{email || user?.username || "—"}</span>
      </SettingRow>
      <SettingRow label="登录方式">
        <span className="text-[13px] text-[var(--color-text-tertiary)]">用户名 / 密码</span>
      </SettingRow>
      <SettingRow label="客户端版本" noBorder>
        <span className="text-[13px] text-[var(--color-text-tertiary)]">LyraNote Desktop 0.1.0</span>
      </SettingRow>

      <GroupLabel>操作</GroupLabel>
      <p className="text-[12px] text-[var(--color-text-tertiary)] mb-3">退出登录将清除本地凭证，下次启动时需要重新登录。</p>
      <motion.button whileTap={{ scale: 0.95 }} onClick={() => useAuthStore.getState().clearAuth()}
        className="px-4 py-2 rounded-lg text-[12px] font-medium border border-red-500/25 text-red-400 hover:bg-red-500/8 transition-colors">
        退出登录
      </motion.button>
    </>
  )
}

// ── Navigation Groups ─────────────────────────────────────────────────────

const NAV_GROUPS: { label: string; ids: Section[] }[] = [
  { label: "常规",  ids: ["general", "appearance"] },
  { label: "账号",  ids: ["account", "security"] },
  { label: "AI",    ids: ["config", "personality", "skills", "memory", "mcp"] },
  { label: "系统",  ids: ["storage", "notifications"] },
]

// ── Main Page ──────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>("general")

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} className="flex h-full">
      {/* Sidebar */}
      <div className="w-52 shrink-0 flex flex-col border-r p-2 pt-1.5 overflow-y-auto"
        style={{ borderColor: "var(--color-border)" }}>
        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.label} label={group.label}>
            {group.ids.map((id) => {
              const s = SECTIONS.find((sec) => sec.id === id)!
              return (
                <motion.button key={s.id} whileTap={{ scale: 0.95 }} onClick={() => setActiveSection(s.id)}
                  className={cn("flex items-center gap-2.5 h-8 w-full px-2.5 rounded-lg text-[13px] font-normal transition-colors text-left",
                    activeSection === s.id
                      ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                      : "text-white/55 hover:text-white/85 hover:bg-white/[0.05]")}>
                  <s.icon size={15} strokeWidth={1.6} className="shrink-0" />
                  {s.label}
                </motion.button>
              )
            })}
          </NavGroup>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-10 py-8">
        <AnimatePresence mode="popLayout">
          <motion.div key={activeSection} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}
            className="max-w-[600px] mx-auto">
            {activeSection === "general"       && <GeneralSection />}
            {activeSection === "appearance"    && <AppearanceSection />}
            {activeSection === "account"       && <AccountSection />}
            {activeSection === "config"        && <ConfigSection />}
            {activeSection === "personality"   && <PersonalitySection />}
            {activeSection === "memory"        && <MemorySection />}
            {activeSection === "skills"        && <SkillsSection />}
            {activeSection === "mcp"           && <McpSection />}
            {activeSection === "storage"       && <StorageSection />}
            {activeSection === "notifications" && <NotificationsSection />}
            {activeSection === "security"      && <SecuritySection />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
