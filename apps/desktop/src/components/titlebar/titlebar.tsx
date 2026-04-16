import { getCurrentWindow } from "@tauri-apps/api/window"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { cn } from "@/lib/cn"
import { useTabStore, type Tab } from "@/store/use-tab-store"
import { useNavStore } from "@/store/use-nav-store"

const appWindow = getCurrentWindow()

export function Titlebar() {
  const { tabs, activeTabId, closeTab, setActiveTab } = useTabStore()
  const { setActiveSection, sidebarExpanded } = useNavStore()

  function handleMaximize() { appWindow.toggleMaximize() }

  function handleTabClick(tab: Tab) {
    setActiveTab(tab.id)
    setActiveSection(tab.type as never)
  }

  function handleDragStart(e: React.MouseEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest("button, input, textarea, a, [role=button]")) return
    appWindow.startDragging()
  }

  return (
    <div
      // When sidebar is collapsed, pad left to clear the absolute traffic-lights overlay (~96px)
      className={cn(
        "flex items-center h-10 shrink-0 select-none",
        sidebarExpanded ? "pl-8" : "pl-36"
      )}
      style={{
        transition: "padding-left 220ms cubic-bezier(0.4,0,0.2,1)",
      }}
      onMouseDown={handleDragStart}
      onDoubleClick={handleMaximize}
    >
      <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto no-scrollbar">
        <AnimatePresence initial={false}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <motion.div
                key={tab.id}
                layout
                layoutDependency={tabs.length}
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.88 }}
                transition={{
                  layout: { type: "spring", stiffness: 360, damping: 38 },
                  opacity: { duration: 0.16, ease: "easeOut" },
                  scale: { type: "spring", stiffness: 380, damping: 36 },
                }}
                onClick={() => handleTabClick(tab)}
                className={cn(
                  "flex items-center gap-1.5 h-6 px-2.5 rounded-md cursor-pointer shrink-0 max-w-[180px] group",
                  "text-[12px] font-medium transition-colors duration-150",
                  isActive
                    ? "bg-white/[0.08] text-white/85"
                    : "text-white/30 hover:text-white/55 hover:bg-white/[0.05]"
                )}
              >
                {tab.isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                )}
                <span className="truncate">{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                    className={cn(
                      "p-0.5 rounded transition-opacity text-white/40 hover:text-white/80 shrink-0",
                      isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60"
                    )}
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

      </div>

      <div className="flex-1 h-full" />
    </div>
  )
}
