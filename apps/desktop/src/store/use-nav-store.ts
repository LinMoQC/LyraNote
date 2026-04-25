import { create } from "zustand"

export type NavSection = "home" | "notebooks" | "knowledge" | "chat" | "scheduled" | "profile" | "settings"

interface NavStore {
  activeSection: NavSection
  sidebarExpanded: boolean
  setActiveSection: (section: NavSection) => void
  toggleSidebar: () => void
  setSidebarExpanded: (v: boolean) => void
}

export const useNavStore = create<NavStore>((set) => ({
  activeSection: "home",
  sidebarExpanded: true,

  setActiveSection: (section) => set({ activeSection: section }),
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setSidebarExpanded: (v) => set({ sidebarExpanded: v }),
}))
