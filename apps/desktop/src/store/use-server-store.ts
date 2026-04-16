import { create } from "zustand"
import { persist } from "zustand/middleware"

interface ServerStore {
  baseUrl: string
  setBaseUrl: (url: string) => void
  clearBaseUrl: () => void
}

export const useServerStore = create<ServerStore>()(
  persist(
    (set) => ({
      baseUrl: "",
      setBaseUrl: (url) => set({ baseUrl: url.replace(/\/$/, "") }),
      clearBaseUrl: () => set({ baseUrl: "" }),
    }),
    { name: "lyranote-server" }
  )
)
