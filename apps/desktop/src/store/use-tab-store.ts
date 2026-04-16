import { create } from "zustand"

export type TabType = "home" | "notebooks" | "editor" | "knowledge" | "chat" | "settings"

export interface Tab {
  id: string
  type: TabType
  title: string
  /** Extra context: noteId, notebookId, etc. */
  meta?: Record<string, unknown>
  isDirty?: boolean
}

interface TabStore {
  tabs: Tab[]
  activeTabId: string | null
  openTab: (tab: Omit<Tab, "id"> & { id?: string }) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, patch: Partial<Tab>) => void
}

let counter = 1
function genId() {
  return `tab-${counter++}`
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [
    { id: "tab-home", type: "home", title: "主页" },
  ],
  activeTabId: "tab-home",

  openTab(tab) {
    const { tabs } = get()
    // If same type+meta already open, just activate
    const existing = tabs.find(
      (t) =>
        t.type === tab.type &&
        JSON.stringify(t.meta) === JSON.stringify(tab.meta)
    )
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const id = tab.id ?? genId()
    set((s) => ({
      tabs: [...s.tabs, { ...tab, id }],
      activeTabId: id,
    }))
  },

  closeTab(id) {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    const next = tabs.filter((t) => t.id !== id)
    let nextActive = activeTabId
    if (activeTabId === id) {
      const fallback = next[idx] ?? next[idx - 1] ?? next[0]
      nextActive = fallback?.id ?? null
    }
    set({ tabs: next, activeTabId: nextActive })
  },

  setActiveTab(id) {
    set({ activeTabId: id })
  },

  updateTab(id, patch) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
  },
}))
