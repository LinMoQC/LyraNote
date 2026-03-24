import { create } from "zustand";
import type { Notebook } from "@lyranote/types";

interface UiState {
  selectedNotebookId: string | null;
  selectedNoteId: string | null;
  isAiPanelOpen: boolean;
  isSidebarCollapsed: boolean;
  activeView: "notes" | "sources" | "knowledge" | "tasks";
  selectNotebook: (id: string | null) => void;
  selectNote: (id: string | null) => void;
  toggleAiPanel: () => void;
  setAiPanelOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setActiveView: (view: UiState["activeView"]) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedNotebookId: null,
  selectedNoteId: null,
  isAiPanelOpen: true,
  isSidebarCollapsed: false,
  activeView: "notes",
  selectNotebook: (id) => set({ selectedNotebookId: id, selectedNoteId: null }),
  selectNote: (id) => set({ selectedNoteId: id }),
  toggleAiPanel: () => set((s) => ({ isAiPanelOpen: !s.isAiPanelOpen })),
  setAiPanelOpen: (open) => set({ isAiPanelOpen: open }),
  toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
  setActiveView: (view) => set({ activeView: view }),
}));
