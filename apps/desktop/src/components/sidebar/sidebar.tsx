import { motion } from "framer-motion"
import {
  Home, BookOpen, Database, MessageSquare,
  Clock, User, Settings, Sun, Moon,
} from "lucide-react"
import { cn } from "@/lib/cn"
import { useNavStore, type NavSection } from "@/store/use-nav-store"
import { useTabStore } from "@/store/use-tab-store"
import { useThemeStore } from "@/store/use-theme-store"
import { useAuthStore } from "@/store/use-auth-store"

interface NavItem {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  label: string
  section: NavSection
  tabType: "home" | "notebooks" | "knowledge" | "chat" | "scheduled" | "profile"
  tabTitle: string
}

const NAV_ITEMS: NavItem[] = [
  { icon: Home,          label: "主页",     section: "home",      tabType: "home",      tabTitle: "主页" },
  { icon: BookOpen,      label: "笔记本",   section: "notebooks", tabType: "notebooks", tabTitle: "笔记本" },
  { icon: Database,      label: "知识库",   section: "knowledge", tabType: "knowledge", tabTitle: "知识库" },
  { icon: MessageSquare, label: "对话",     section: "chat",      tabType: "chat",      tabTitle: "对话" },
  { icon: Clock,         label: "定时任务", section: "scheduled", tabType: "scheduled", tabTitle: "定时任务" },
  { icon: User,          label: "自我画像", section: "profile",   tabType: "profile",   tabTitle: "自我画像" },
]

export function Sidebar() {
  const { activeSection, setActiveSection } = useNavStore()
  const { openTab } = useTabStore()
  const { isDark, toggleTheme } = useThemeStore()
  const { user } = useAuthStore()
  const displayName = user?.name ?? user?.username ?? "用户"
  const initial = displayName.charAt(0).toUpperCase()

  function handleNav(item: NavItem) {
    setActiveSection(item.section)
    openTab({ type: item.tabType as never, title: item.tabTitle })
  }

  return (
    <aside className="flex flex-col h-full" style={{ width: 200 }}>
      {/* Spacer for the absolute-positioned traffic lights row */}
      <div className="h-10 shrink-0" />

      {/* ── Logo ── */}
      <div className="flex items-center h-10 px-3 shrink-0">
        <motion.div
          whileTap={{ scale: 0.9 }}
          className="w-7 h-7 rounded-lg overflow-hidden shrink-0 cursor-pointer"
        >
          <img src="/lyra.png" alt="LyraNote" className="w-full h-full object-cover" />
        </motion.div>
        <span className="ml-2.5 text-[13px] font-semibold text-white/80 whitespace-nowrap">
          LyraNote
        </span>
      </div>

      {/* ── Nav items ── */}
      <nav className="flex flex-col gap-1 px-2 flex-1 pt-2">
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.section
          return (
            <motion.button
              key={item.section}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleNav(item)}
              className={cn(
                "relative flex items-center gap-2.5 h-9 px-2.5 rounded-lg transition-colors text-left",
                isActive
                  ? "bg-white/[0.09] text-white"
                  : "text-white/60 hover:text-white/85 hover:bg-white/[0.05]"
              )}
            >
              <item.icon size={16} strokeWidth={1.6} className="shrink-0" />
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[14px] font-normal whitespace-nowrap"
              >
                {item.label}
              </motion.span>
            </motion.button>
          )
        })}
      </nav>

      {/* ── Bottom ── */}
      <div className="flex flex-col gap-1 px-2 pb-3">
        <div className="mx-2 mb-1 h-px bg-white/[0.10]" />

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={toggleTheme}
          className="flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-white/60 hover:text-white/85 hover:bg-white/[0.05] transition-colors"
        >
          {isDark
            ? <Sun size={16} strokeWidth={1.6} className="shrink-0" />
            : <Moon size={16} strokeWidth={1.6} className="shrink-0" />}
          <span className="text-[14px] font-normal whitespace-nowrap">
            {isDark ? "亮色模式" : "暗色模式"}
          </span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setActiveSection("settings")
            openTab({ type: "settings" as never, title: "设置" })
          }}
          className={cn(
            "flex items-center gap-2.5 h-9 px-2.5 rounded-lg transition-colors",
            activeSection === "settings"
              ? "bg-white/[0.09] text-white"
              : "text-white/60 hover:text-white/85 hover:bg-white/[0.05]"
          )}
        >
          <Settings size={16} strokeWidth={1.6} className="shrink-0" />
          <span className="text-[14px] font-normal whitespace-nowrap">设置</span>
        </motion.button>

        <div className="flex items-center gap-2.5 h-8 px-2.5 mt-0.5">
          <div className="w-5 h-5 rounded-full shrink-0 ring-1 ring-white/10 overflow-hidden bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
            {user?.avatar_url
              ? <img src={user.avatar_url} alt={displayName} className="w-full h-full object-cover" />
              : <span className="text-white text-[9px] font-bold">{initial}</span>
            }
          </div>
          <span className="text-[14px] font-normal text-white/65 whitespace-nowrap">{displayName}</span>
        </div>
      </div>
    </aside>
  )
}
