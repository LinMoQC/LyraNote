import { create } from "zustand"

interface ThemeStore {
  isDark: boolean
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  isDark: true,
  toggleTheme: () =>
    set((s) => {
      const next = !s.isDark
      document.documentElement.classList.toggle("light", !next)
      return { isDark: next }
    }),
}))
