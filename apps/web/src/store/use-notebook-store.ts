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
  setActiveSourceId: (id: string | null) => void;
  setCenterPanelMode: (mode: "reader" | "editor") => void;
};

export const useNotebookStore = create<NotebookStore>((set) => ({
  activeSourceId: null,
  centerPanelMode: "editor",
  setActiveSourceId: (id) => set({ activeSourceId: id }),
  setCenterPanelMode: (mode) => set({ centerPanelMode: mode })
}));
