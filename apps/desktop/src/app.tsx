import { lazy, memo, Suspense, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import {
  fileReveal,
  listenDesktopWindowRoute,
  listenImportResults,
  listenJobProgress,
  listenRuntimeState,
  listenWindowFileDrop,
  notificationShow,
  runtimeRestart,
  runtimeStatus,
  watchFoldersSync,
} from "@/lib/desktop-bridge"
import { hydrateDesktopAuthSession } from "@/lib/auth-session"
import { RuntimeStatusScreen } from "@/components/runtime/runtime-status-screen"
import { Titlebar } from "@/components/titlebar/titlebar"
import { Sidebar } from "@/components/sidebar/sidebar"
import { useTabStore } from "@/store/use-tab-store"
import { useNavStore } from "@/store/use-nav-store"
import { useAuthStore } from "@/store/use-auth-store"
import { useDesktopJobsStore } from "@/store/use-desktop-jobs-store"
import { useDesktopRuntimeStore } from "@/store/use-desktop-runtime-store"
import { pageVariants, pageTransition } from "@/lib/animations"
import { windowService } from "@/lib/window-service"
import { getDesktopJobs, getWatchFolders } from "@/services/desktop-service"
import { importGlobalPath } from "@/services/source-service"
import type { DesktopWindowKind, DesktopWindowRoute } from "@/types"
import { Clock, User } from "lucide-react"

const LoginPage = lazy(() => import("@/pages/login/login-page").then((module) => ({ default: module.LoginPage })))
const HomePage = lazy(() => import("@/pages/home/home-page").then((module) => ({ default: module.HomePage })))
const NotebooksPage = lazy(() => import("@/pages/notebooks/notebooks-page").then((module) => ({ default: module.NotebooksPage })))
const EditorPage = lazy(() => import("@/pages/editor/editor-page").then((module) => ({ default: module.EditorPage })))
const KnowledgePage = lazy(() => import("@/pages/knowledge/knowledge-page").then((module) => ({ default: module.KnowledgePage })))
const ChatPage = lazy(() => import("@/pages/chat/chat-page").then((module) => ({ default: module.ChatPage })))
const SettingsPage = lazy(() => import("@/pages/settings/settings-page").then((module) => ({ default: module.SettingsPage })))
const QuickCapturePage = lazy(() =>
  import("@/pages/quick-capture/quick-capture-page").then((module) => ({ default: module.QuickCapturePage })),
)

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

const TabContent = memo(function TabContent() {
  const { tabs, activeTabId } = useTabStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  if (!activeTab) return null

  return (
    <AnimatePresence mode="wait">
      <motion.div key={activeTab.id} className="h-full flex flex-col overflow-hidden">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">加载中...</div>}>
          {activeTab.type === "home" && <HomePage />}
          {activeTab.type === "notebooks" && <NotebooksPage />}
          {activeTab.type === "editor" && (
            <EditorPage
              title={activeTab.title}
              notebookTitle={activeTab.title}
              notebookId={activeTab.meta?.notebookId}
            />
          )}
          {activeTab.type === "knowledge" && <KnowledgePage />}
          {activeTab.type === "chat" && (
            <ChatPage
              initialMessage={activeTab.meta?.initialMessage}
              initialDraftId={activeTab.meta?.draftId}
            />
          )}
          {activeTab.type === "settings" && <SettingsPage />}
        </Suspense>
        {activeTab.type === "scheduled" && (
          <PlaceholderPage icon={Clock} title="定时任务" />
        )}
        {activeTab.type === "profile" && (
          <PlaceholderPage icon={User} title="自我画像" />
        )}
      </motion.div>
    </AnimatePresence>
  )
})

function TrafficLights({ showToggle = false, onToggle }: { showToggle?: boolean; onToggle?: () => void }) {
  return createPortal(
    <div className="fixed top-0 left-0 z-[9999] flex items-center gap-2 h-10 pl-3 select-none">
      <button
        onClick={() => void windowService.close()}
        className="group/btn w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-90 active:brightness-75 transition-[filter] shrink-0 flex items-center justify-center"
      >
        <svg className="opacity-0 group-hover/btn:opacity-100 transition-opacity" width="6" height="6" viewBox="0 0 6 6">
          <path d="M1 1l4 4M5 1L1 5" stroke="#4e0002" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        onClick={() => void windowService.minimize()}
        className="group/btn w-3 h-3 rounded-full bg-[#ffbd2e] hover:brightness-90 active:brightness-75 transition-[filter] shrink-0 flex items-center justify-center"
      >
        <svg className="opacity-0 group-hover/btn:opacity-100 transition-opacity" width="6" height="6" viewBox="0 0 6 6">
          <path d="M1 3h4" stroke="#5a3600" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        onClick={() => void windowService.toggleMaximize()}
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
  const token = useAuthStore((s) => s.token)
  const sidebarExpanded = useNavStore((s) => s.sidebarExpanded)
  const toggleSidebar = useNavStore((s) => s.toggleSidebar)
  const setActiveSection = useNavStore((s) => s.setActiveSection)
  const openTab = useTabStore((s) => s.openTab)
  const applyProgressEvent = useDesktopJobsStore((s) => s.applyProgressEvent)
  const setJobs = useDesktopJobsStore((s) => s.setJobs)
  const status = useDesktopRuntimeStore((s) => s.status)
  const runtimeChecked = useDesktopRuntimeStore((s) => s.runtimeChecked)
  const sessionHydrated = useDesktopRuntimeStore((s) => s.sessionHydrated)
  const setStatus = useDesktopRuntimeStore((s) => s.setStatus)
  const markRuntimeChecked = useDesktopRuntimeStore((s) => s.markRuntimeChecked)
  const markSessionHydrated = useDesktopRuntimeStore((s) => s.markSessionHydrated)
  const hydratingSessionRef = useRef(false)
  const previousRuntimeStateRef = useRef<string | null>(null)
  const currentWindowKind = windowService.label as DesktopWindowKind
  const [windowRoute, setWindowRoute] = useState<DesktopWindowRoute | null>(null)
  const [chatWindowSeed, setChatWindowSeed] = useState(0)

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    async function hydrateIfNeeded() {
      if (hydratingSessionRef.current || useDesktopRuntimeStore.getState().sessionHydrated) return
      hydratingSessionRef.current = true
      try {
        await hydrateDesktopAuthSession()
      } finally {
        hydratingSessionRef.current = false
        if (!cancelled) {
          markSessionHydrated()
        }
      }
    }

    async function bootstrap() {
      try {
        const initialStatus = await runtimeStatus()
        if (!cancelled) {
          setStatus(initialStatus)
        }
        if (initialStatus.state === "ready") {
          await hydrateIfNeeded()
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            state: "degraded",
            mode: "source",
            health_url: "",
            api_base_url: "",
            pid: null,
            version: null,
            last_error: (error as Error)?.message ?? "Failed to bootstrap desktop runtime.",
            last_exit_reason: null,
            last_healthcheck_at: null,
            last_heartbeat_at: null,
            log_path: "",
            state_dir: "",
            sidecar_path: null,
            restart_count: 0,
            watcher_count: 0,
            watchers_paused: false,
            last_restart_at: null,
          })
          markSessionHydrated()
        }
      } finally {
        if (!cancelled) {
          markRuntimeChecked()
        }
      }

      unlisten = await listenRuntimeState(async (nextStatus) => {
        if (cancelled) return
        setStatus(nextStatus)
        if (nextStatus.state === "ready") {
          await hydrateIfNeeded()
        }
      })
    }

    void bootstrap()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [markRuntimeChecked, markSessionHydrated, setStatus])

  useEffect(() => {
    if (!status || status.state === previousRuntimeStateRef.current) {
      return
    }
    const previous = previousRuntimeStateRef.current
    previousRuntimeStateRef.current = status.state
    if (previous === "ready" && status.state === "degraded") {
      void notificationShow({
        kind: "Runtime",
        title: "LyraNote 本地服务异常",
        body: status.last_error ?? "桌面 sidecar 已退出或不可用。",
      })
    }
  }, [status])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    void (async () => {
      unlisten = await listenDesktopWindowRoute((payload) => {
        if (cancelled) return
        setWindowRoute(payload)
        if (currentWindowKind === "chat" && payload.initialMessage) {
          setChatWindowSeed((value) => value + 1)
        }
      })
    })()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [currentWindowKind])

  useEffect(() => {
    if (!token || status?.state !== "ready") {
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const [jobs, folders] = await Promise.all([
          getDesktopJobs(),
          getWatchFolders(),
        ])
        if (cancelled) return
        setJobs(jobs)
        await watchFoldersSync(folders)
      } catch (error) {
        console.warn("Failed to bootstrap desktop jobs/watch folders", error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [setJobs, status?.state, token])

  useEffect(() => {
    if (currentWindowKind !== "main" || !windowRoute) {
      return
    }

    if (windowRoute.section) {
      const nextSection = windowRoute.section as Parameters<typeof setActiveSection>[0]
      setActiveSection(nextSection)
      if (nextSection === "knowledge") {
        openTab({ type: "knowledge", title: "知识库" })
      }
      if (nextSection === "notebooks") {
        openTab({ type: "notebooks", title: "笔记本" })
      }
      if (nextSection === "settings") {
        openTab({ type: "settings", title: "设置" })
      }
    }
  }, [currentWindowKind, openTab, setActiveSection, windowRoute])

  useEffect(() => {
    let cancelled = false
    let unlistenJob: (() => void) | undefined
    let unlistenImport: (() => void) | undefined
    let unlistenDrop: (() => void) | undefined

    async function attach() {
      unlistenJob = await listenJobProgress((event) => {
        if (cancelled) return
        applyProgressEvent(event)
      })

      unlistenImport = await listenImportResults((event) => {
        if (cancelled) return
        if (event.payload.state === "succeeded") {
          void notificationShow({
            kind: "导入完成",
            title: "知识库已更新",
            body: event.payload.path ?? "桌面导入任务已完成。",
          })
          return
        }
        if (event.payload.state === "failed") {
          void notificationShow({
            kind: "导入失败",
            title: "知识库导入失败",
            body: event.payload.error ?? event.payload.path ?? "桌面导入任务失败。",
          })
        }
      })

      unlistenDrop = await listenWindowFileDrop((paths) => {
        if (cancelled || status?.state !== "ready" || !token) {
          return
        }

        const filePaths = paths.filter((path) => !path.endsWith("/"))
        const directoryPaths = paths.filter((path) => path.endsWith("/"))

        if (directoryPaths.length > 0) {
          void notificationShow({
            kind: "拖拽导入",
            title: "目录暂不支持直接拖入",
            body: "请在知识库页注册监听目录来持续导入文件夹内容。",
          })
        }

        if (filePaths.length === 0) {
          return
        }

        void Promise.allSettled(filePaths.map((path) => importGlobalPath(path))).then((results) => {
          const failed = results.filter((result) => result.status === "rejected")
          if (failed.length > 0) {
            void notificationShow({
              kind: "拖拽导入",
              title: "部分文件导入失败",
              body: `共 ${failed.length} 个文件未能加入知识库队列。`,
            })
            return
          }
          void notificationShow({
            kind: "拖拽导入",
            title: "文件已加入知识库",
            body: `已提交 ${filePaths.length} 个文件到本地导入队列。`,
          })
        })
      })
    }

    void attach()

    return () => {
      cancelled = true
      unlistenJob?.()
      unlistenImport?.()
      unlistenDrop?.()
    }
  }, [applyProgressEvent, status?.state, token])

  async function handleRestartRuntime() {
    const nextStatus = await runtimeRestart()
    setStatus(nextStatus)
  }

  async function handleRevealLogs() {
    if (!status?.log_path) return
    await fileReveal(status.log_path)
  }

  if (!runtimeChecked || !status || status.state === "starting") return (
    <div className="relative h-full rounded-xl overflow-hidden" style={{ background: "var(--color-bg-base)" }} onMouseDown={(e) => { if (e.button === 0) void windowService.startDragging() }}>
      <TrafficLights />
      <RuntimeStatusScreen status={status} loading />
    </div>
  )

  if (status.state !== "ready") return (
    <div className="relative h-full rounded-xl overflow-hidden" style={{ background: "var(--color-bg-base)" }} onMouseDown={(e) => { if (e.button === 0 && !(e.target as HTMLElement).closest("button,input,a,[role=button]")) void windowService.startDragging() }}>
      <TrafficLights />
      <RuntimeStatusScreen status={status} onRestart={() => void handleRestartRuntime()} onRevealLogs={() => void handleRevealLogs()} />
    </div>
  )

  if (!sessionHydrated) return (
    <div className="relative h-full rounded-xl overflow-hidden" style={{ background: "var(--color-bg-base)" }} onMouseDown={(e) => { if (e.button === 0) void windowService.startDragging() }}>
      <TrafficLights />
      <RuntimeStatusScreen status={status} loading />
    </div>
  )

  if (!token) return (
    <div className="relative h-full rounded-xl overflow-hidden" style={{ background: "var(--color-bg-base)" }} onMouseDown={(e) => { if (e.button === 0 && !(e.target as HTMLElement).closest("button,input,a,[role=button]")) void windowService.startDragging() }}>
      <TrafficLights />
      <Suspense fallback={null}>
        <LoginPage />
      </Suspense>
    </div>
  )

  function handleDragStart(e: React.MouseEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest("button, input, textarea, a, [role=button]")) return
    void windowService.startDragging()
  }

  if (currentWindowKind === "quick-capture") {
    return (
      <div className="relative h-full rounded-xl overflow-hidden" style={{ background: "var(--color-bg-base)" }}>
        <TrafficLights />
        <div onMouseDown={handleDragStart} className="h-full pt-10">
          <Suspense fallback={null}>
            <QuickCapturePage initialMode={windowRoute?.mode ?? "note"} />
          </Suspense>
        </div>
      </div>
    )
  }

  if (currentWindowKind === "chat") {
    return (
      <div className="relative h-full rounded-xl overflow-hidden" style={{ background: "var(--color-bg-base)" }}>
        <TrafficLights />
        <div onMouseDown={handleDragStart} className="h-full pt-10">
          <Suspense fallback={null}>
            <ChatPage
              key={`chat-window-${chatWindowSeed}-${windowRoute?.initialMessage ?? ""}`}
              initialMessage={windowRoute?.initialMessage}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative h-full flex"
      style={{
        background: "rgba(24, 24, 28, 0.65)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
      }}
    >
      <TrafficLights showToggle onToggle={toggleSidebar} />

      {/* ── Sidebar column ── */}
      <div
        className="h-full shrink-0 overflow-hidden"
        style={{
          width: sidebarExpanded ? 200 : 0,
          transition: "width 220ms cubic-bezier(0.4,0,0.2,1)",
          willChange: "width",
        }}
      >
        <div className="w-[200px] h-full">
          <Sidebar />
        </div>
      </div>

      {/* ── Right content block ── */}
      <div
        className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-tl-xl rounded-bl-xl"
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
