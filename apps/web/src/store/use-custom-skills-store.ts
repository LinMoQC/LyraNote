"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

export interface CustomSkill {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
}

interface CustomSkillsStore {
  skills: CustomSkill[];
  addSkill: (name: string, prompt: string) => void;
  updateSkill: (id: string, updates: Partial<Omit<CustomSkill, "id">>) => void;
  deleteSkill: (id: string) => void;
  reorderSkills: (skills: CustomSkill[]) => void;
}

export const useCustomSkillsStore = create<CustomSkillsStore>()(
  persist(
    (set) => ({
      skills: [
        {
          id: "default-1",
          name: "翻译成英文",
          prompt: "请将选中的文本翻译成英文，保持语气自然、地道。",
          createdAt: Date.now(),
        },
        {
          id: "default-2",
          name: "总结要点",
          prompt: "请总结选中心内容的 3-5 个核心要点。",
          createdAt: Date.now() + 1,
        },
      ],
      addSkill: (name, prompt) =>
        set((state) => ({
          skills: [
            ...state.skills,
            {
              id: uuidv4(),
              name,
              prompt,
              createdAt: Date.now(),
            },
          ],
        })),
      updateSkill: (id, updates) =>
        set((state) => ({
          skills: state.skills.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),
      deleteSkill: (id) =>
        set((state) => ({
          skills: state.skills.filter((s) => s.id !== id),
        })),
      reorderSkills: (skills) => set({ skills }),
    }),
    {
      name: "lyranote-custom-skills",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
