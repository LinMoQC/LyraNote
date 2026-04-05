"use client";

/**
 * @file 笔记本工作区状态管理
 * @description 管理当前笔记本工作区的状态：活跃来源 ID、中心面板模式（阅读/编辑）。
 */

import { create } from "zustand";

/** 笔记本工作区状态 */
type NotebookStore = {
  activeSourceId: string | null;
  centerPanelMode: "reader" | "editor";
  copilotPanelOpen: boolean;
  copilotStreaming: boolean;
  lastInteractionAt: number;
  lastTypingAt: number;
  setActiveSourceId: (id: string | null) => void;
  setCenterPanelMode: (mode: "reader" | "editor") => void;
  setCopilotPanelOpen: (open: boolean) => void;
  setCopilotStreaming: (streaming: boolean) => void;
  recordInteraction: (timestamp?: number) => void;
  recordTyping: (timestamp?: number) => void;
};

export const useNotebookStore = create<NotebookStore>((set) => ({
  activeSourceId: null,
  centerPanelMode: "editor",
  copilotPanelOpen: false,
  copilotStreaming: false,
  lastInteractionAt: 0,
  lastTypingAt: 0,
  setActiveSourceId: (id) => set({ activeSourceId: id }),
  setCenterPanelMode: (mode) => set({ centerPanelMode: mode }),
  setCopilotPanelOpen: (open) => set({ copilotPanelOpen: open }),
  setCopilotStreaming: (streaming) => set({ copilotStreaming: streaming }),
  recordInteraction: (timestamp = Date.now()) => set({ lastInteractionAt: timestamp }),
  recordTyping: (timestamp = Date.now()) =>
    set({
      lastTypingAt: timestamp,
      lastInteractionAt: timestamp,
    }),
}));
