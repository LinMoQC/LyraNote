import { createPortal } from "react-dom"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { AnimatePresence, motion } from "framer-motion"
import { Titlebar } from "@/components/titlebar/titlebar"
import { Sidebar } from "@/components/sidebar/sidebar"
import { useTabStore } from "@/store/use-tab-store"
import { useNavStore } from "@/store/use-nav-store"
import { useServerStore } from "@/store/use-server-store"
import { useAuthStore } from "@/store/use-auth-store"
import { SetupPage } from "@/pages/setup/setup-page"
import { LoginPage } from "@/pages/login/login-page"
import { HomePage } from "@/pages/home/home-page"
import { NotebooksPage } from "@/pages/notebooks/notebooks-page"
import { EditorPage } from "@/pages/editor/editor-page"
import { KnowledgePage } from "@/pages/knowledge/knowledge-page"
import { ChatPage } from "@/pages/chat/chat-page"
import { SettingsPage } from "@/pages/settings/settings-page"
import { pageVariants, pageTransition } from "@/lib/animations"
import { Clock, User } from "lucide-react"

const appWindow = getCurrentWindow()

function PlaceholderPage({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
}) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col items-center justify-center h-full gap-4"
    >
      <Icon size={40} className="text-[var(--color-text-tertiary)]" />
      <p className="text-[16px] font-medium text-[var(--color-text-secondary)]">{title}</p>
      <p className="text-[13px] text-[var(--color-text-tertiary)]">即将推出</p>
    </motion.div>
  )
}

function TabContent() {
  const { tabs, activeTabId } = useTabStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  if (!activeTab) return null

  return (
    <AnimatePresence mode="wait">
      <motion.div key={activeTab.id} className="h-full flex flex-col overflow-hidden">
        {activeTab.type === "home" && <HomePage />}
        {activeTab.type === "notebooks" && <NotebooksPage />}
        {activeTab.type === "editor" && (
          <EditorPage
            title={activeTab.title}
            notebookTitle={activeTab.title}
            notebookId={activeTab.meta?.notebookId as string | undefined}
          />
        )}
        {activeTab.type === "knowledge" && <KnowledgePage />}
        {activeTab.type === "chat" && (
          <ChatPage
            initialMessage={activeTab.meta?.initialMessage as string | undefined}
            initialDraftId={activeTab.meta?.draftId as string | undefined}
          />
        )}
        {activeTab.type === "settings" && <SettingsPage />}
        {(activeTab.type as string) === "scheduled" && (
          <PlaceholderPage icon={Clock} title="定时任务" />
        )}
        {(activeTab.type as string) === "profile" && (
          <PlaceholderPage icon={User} title="自我画像" />
        )}
      </motion.div>
    </AnimatePresence>
  )
}

function TrafficLights({ showToggle = false, onToggle }: { showToggle?: boolean; onToggle?: () => void }) {
  return createPortal(
    <div className="fixed top-0 left-0 z-[9999] flex items-center gap-2 h-10 pl-3 select-none">
      <button
        onClick={() => appWindow.close()}
        className="group/btn w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-90 active:brightness-75 transition-[filter] shrink-0 flex items-center justify-center"
      >
        <svg className="opacity-0 group-hover/btn:opacity-100 transition-opacity" width="6" height="6" viewBox="0 0 6 6">
          <path d="M1 1l4 4M5 1L1 5" stroke="#4e0002" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        onClick={() => appWindow.minimize()}
        className="group/btn w-3 h-3 rounded-full bg-[#ffbd2e] hover:brightness-90 active:brightness-75 transition-[filter] shrink-0 flex items-center justify-center"
      >
        <svg className="opacity-0 group-hover/btn:opacity-100 transition-opacity" width="6" height="6" viewBox="0 0 6 6">
          <path d="M1 3h4" stroke="#5a3600" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        onClick={() => appWindow.toggleMaximize()}
        className="group/btn w-3 h-3 rounded-full bg-[#28c840] hover:brightness-90 active:brightness-75 transition-[filter] shrink-0 flex items-center justify-center"
      >
        <svg className="opacity-0 group-hover/btn:opacity-100 transition-opacity" width="6" height="6" viewBox="0 0 6 6">
          <path d="M1 5L5 1M3 1h2v2" stroke="#003d00" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {showToggle && onToggle && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggle}
          className="ml-3 w-7 h-7 flex items-center justify-center rounded-md text-white/35 hover:text-white/70 hover:bg-white/[0.08] transition-colors shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 1024 1024" fill="currentColor">
            <path d="M725.333333 132.266667A166.4 166.4 0 0 1 891.733333 298.666667v426.666666c0 91.904-74.496 166.4-166.4 166.4H298.666667A166.442667 166.442667 0 0 1 132.266667 725.333333V298.666667A166.4 166.4 0 0 1 298.666667 132.266667h426.666666z m-281.6 682.666666H725.333333a89.6 89.6 0 0 0 89.6-89.6V298.666667A89.6 89.6 0 0 0 725.333333 209.066667h-281.6v605.866666zM298.666667 209.066667A89.6 89.6 0 0 0 209.066667 298.666667v426.666666c0 49.493333 40.106667 89.6 89.6 89.6h68.266666V209.066667H298.666667z" />
          </svg>
        </motion.button>
      )}
    </div>,
    document.body
  )
}

export function App() {
  const { baseUrl } = useServerStore()
  const { token } = useAuthStore()
  const { sidebarExpanded, toggleSidebar } = useNavStore()

  if (!baseUrl) return (
    <div className="relative h-full rounded-xl overflow-hidden" style={{ background: "var(--color-bg-base)" }} onMouseDown={(e) => { if (e.button === 0) appWindow.startDragging() }}>
      <TrafficLights />
      <SetupPage />
    </div>
  )

  if (!token) return (
    <div className="relative h-full rounded-xl overflow-hidden" style={{ background: "var(--color-bg-base)" }} onMouseDown={(e) => { if (e.button === 0 && !(e.target as HTMLElement).closest("button,input,a,[role=button]")) appWindow.startDragging() }}>
      <TrafficLights />
      <LoginPage />
    </div>
  )

  function handleDragStart(e: React.MouseEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest("button, input, textarea, a, [role=button]")) return
    appWindow.startDragging()
  }

  return (
    <div
      className="relative h-full"
      style={{
        display: "grid",
        gridTemplateColumns: `${sidebarExpanded ? 200 : 0}px minmax(0, 1fr)`,
        transition: "grid-template-columns 220ms cubic-bezier(0.4,0,0.2,1)",
        background: "rgba(24, 24, 28, 0.65)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
      }}
    >
      <TrafficLights showToggle onToggle={toggleSidebar} />

      {/* ── Sidebar column: frosted glass layer ── */}
      <div className="overflow-hidden h-full">
        <Sidebar />
      </div>

      {/* ── Right content block ── */}
      <div
        className="flex flex-col min-w-0 overflow-hidden rounded-tl-xl rounded-bl-xl"
        style={{ background: "var(--color-bg-base)" }}
      >
        <div onMouseDown={handleDragStart}>
          <Titlebar />
        </div>
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <TabContent />
        </main>
      </div>

    </div>
  )
}

export default App
