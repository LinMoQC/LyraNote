"use client";

/**
 * @file UI 状态管理
 * @description 管理全局 UI 状态（侧边栏折叠、导入弹窗、设置弹窗、右侧面板切换）。
 *              侧边栏折叠状态通过 localStorage 持久化。
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** UI 全局状态 */
type UiStore = {
  sidebarCollapsed: boolean;
  importDialogOpen: boolean;
  settingsOpen: boolean;
  settingsInitialSection: string | null;
  activeRightPanel: "copilot" | "artifacts";
  toggleSidebar: () => void;
  setImportDialogOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean, section?: string) => void;
  setActiveRightPanel: (panel: UiStore["activeRightPanel"]) => void;
};

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      importDialogOpen: false,
      settingsOpen: false,
      settingsInitialSection: null,
      activeRightPanel: "copilot",
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setImportDialogOpen: (open) => set({ importDialogOpen: open }),
      setSettingsOpen: (open, section) => set({ settingsOpen: open, settingsInitialSection: section ?? null }),
      setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),
    }),
    {
      name: "lyranote-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
);
