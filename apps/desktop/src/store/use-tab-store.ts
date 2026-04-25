import { create } from "zustand"

export type TabType =
  | "home"
  | "notebooks"
  | "editor"
  | "knowledge"
  | "chat"
  | "settings"
  | "scheduled"
  | "profile"

interface BaseTab {
  id: string
  title: string
  isDirty?: boolean
}

export type Tab =
  | (BaseTab & { type: "home" | "notebooks" | "knowledge" | "settings" | "scheduled" | "profile" })
  | (BaseTab & { type: "editor"; meta: { notebookId?: string } })
  | (BaseTab & {
      type: "chat"
      meta?: {
        initialMessage?: string
        draftId?: string
      }
    })

export type TabInput =
  | ({ id?: string } & Omit<BaseTab, "id"> & { type: "home" | "notebooks" | "knowledge" | "settings" | "scheduled" | "profile" })
  | ({ id?: string } & Omit<BaseTab, "id"> & { type: "editor"; meta: { notebookId?: string } })
  | ({ id?: string } & Omit<BaseTab, "id"> & {
      type: "chat"
      meta?: {
        initialMessage?: string
        draftId?: string
      }
    })

interface TabStore {
  tabs: Tab[]
  activeTabId: string | null
  openTab: (tab: TabInput) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, patch: Partial<Tab>) => void
}

let counter = 1
function genId() {
  return `tab-${counter++}`
}

function serializeTabMeta(tab: TabInput) {
  if ("meta" in tab && tab.meta) {
    return JSON.stringify(tab.meta)
  }
  return ""
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [
    { id: "tab-home", type: "home", title: "主页" },
  ],
  activeTabId: "tab-home",

  openTab(tab) {
    const { tabs } = get()
    const existing = tabs.find(
      (t) =>
        t.type === tab.type &&
        serializeTabMeta(t) === serializeTabMeta(tab)
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
      tabs: s.tabs.map((t) => (t.id === id ? ({ ...t, ...patch } as Tab) : t)),
    }))
  },
}))
