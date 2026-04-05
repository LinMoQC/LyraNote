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
  origin: "source_indexed" | "proactive_insight" | "lyra_thought";
  delivery: "inbox" | "surface";
  fingerprint: string;
  sourceId?: string;
  sourceName?: string;
  summary?: string;
  questions?: string[];
  message?: string;
  createdAt: number;
  read: boolean;
  surfacedAt?: number;
  hiddenAt?: number;
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

  addSuggestion: (suggestion: Omit<ProactiveSuggestion, "id" | "createdAt" | "read">) => string | null;
  markAllRead: () => void;
  dismissSuggestion: (id: string) => void;
  hideSuggestion: (id: string) => void;
  clearAll: () => void;
  setWritingContext: (chunks: WritingContextChunk[]) => void;
};

export const useProactiveStore = create<ProactiveStore>()((set) => ({
  suggestions: [],
  writingContext: [],
  unreadCount: 0,

  addSuggestion: (suggestion) =>
    {
      const now = Date.now();
      let createdId: string | null = null;
      set((state) => {
        if (state.suggestions.some((item) => item.origin === suggestion.origin && item.fingerprint === suggestion.fingerprint)) {
          return state;
        }

        const newSuggestion: ProactiveSuggestion = {
          ...suggestion,
          id: `proactive-${now}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: now,
          read: false,
          surfacedAt: suggestion.delivery === "surface" ? now : undefined,
        };
        createdId = newSuggestion.id;
        const updated = [newSuggestion, ...state.suggestions].slice(0, 20);
        return {
          suggestions: updated,
          unreadCount: updated.filter((s) => !s.read).length,
        };
      });
      return createdId;
    },

  markAllRead: () =>
    set((state) => ({
      suggestions: state.suggestions.map((s) => ({
        ...s,
        read: true,
        hiddenAt: s.hiddenAt ?? Date.now(),
      })),
      unreadCount: 0,
    })),

  dismissSuggestion: (id) =>
    set((state) => {
      const updated = state.suggestions.map((s) =>
        s.id === id
          ? { ...s, read: true, hiddenAt: s.hiddenAt ?? Date.now() }
          : s,
      );
      return {
        suggestions: updated,
        unreadCount: updated.filter((s) => !s.read).length,
      };
    }),

  hideSuggestion: (id) =>
    set((state) => {
      const updated = state.suggestions.map((s) =>
        s.id === id && !s.hiddenAt
          ? { ...s, hiddenAt: Date.now() }
          : s,
      );
      return {
        suggestions: updated,
        unreadCount: updated.filter((s) => !s.read).length,
      };
    }),

  clearAll: () => set({ suggestions: [], unreadCount: 0 }),

  setWritingContext: (chunks) => set({ writingContext: chunks }),
}));
