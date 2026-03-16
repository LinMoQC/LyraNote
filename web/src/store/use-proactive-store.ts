"use client";

/**
 * @file AI 主动建议状态管理
 * @description 管理 Copilot 面板中的主动建议卡片和编辑器写作上下文片段。
 *              建议上限 20 条，支持添加、已读标记、删除和清空操作。
 */

import { create } from "zustand";

/** AI 主动建议条目 */
export type ProactiveSuggestion = {
  id: string;
  type: "source_indexed" | "insight" | "nudge";
  sourceId?: string;
  sourceName?: string;
  summary?: string;
  questions?: string[];
  message?: string;
  createdAt: number;
  read: boolean;
};

/** 写作辅助上下文片段 */
export type WritingContextChunk = {
  source_title: string;
  excerpt: string;
  score: number;
  chunk_id: string;
};

/** 主动建议状态及操作方法 */
type ProactiveStore = {
  suggestions: ProactiveSuggestion[];
  writingContext: WritingContextChunk[];
  unreadCount: number;

  addSuggestion: (suggestion: Omit<ProactiveSuggestion, "id" | "createdAt" | "read">) => void;
  markAllRead: () => void;
  dismissSuggestion: (id: string) => void;
  clearAll: () => void;
  setWritingContext: (chunks: WritingContextChunk[]) => void;
};

export const useProactiveStore = create<ProactiveStore>()((set) => ({
  suggestions: [],
  writingContext: [],
  unreadCount: 0,

  addSuggestion: (suggestion) =>
    set((state) => {
      const newSuggestion: ProactiveSuggestion = {
        ...suggestion,
        id: `proactive-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
        read: false,
      };
      const updated = [newSuggestion, ...state.suggestions].slice(0, 20);
      return {
        suggestions: updated,
        unreadCount: updated.filter((s) => !s.read).length,
      };
    }),

  markAllRead: () =>
    set((state) => ({
      suggestions: state.suggestions.map((s) => ({ ...s, read: true })),
      unreadCount: 0,
    })),

  dismissSuggestion: (id) =>
    set((state) => {
      const updated = state.suggestions.filter((s) => s.id !== id);
      return {
        suggestions: updated,
        unreadCount: updated.filter((s) => !s.read).length,
      };
    }),

  clearAll: () => set({ suggestions: [], unreadCount: 0 }),

  setWritingContext: (chunks) => set({ writingContext: chunks }),
}));
