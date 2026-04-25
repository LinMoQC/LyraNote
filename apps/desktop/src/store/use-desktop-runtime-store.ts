import { create } from "zustand"

import type { DesktopRuntimeStatus } from "@/types"

interface DesktopRuntimeStore {
  status: DesktopRuntimeStatus | null
  runtimeChecked: boolean
  sessionHydrated: boolean
  setStatus: (status: DesktopRuntimeStatus) => void
  markRuntimeChecked: () => void
  markSessionHydrated: () => void
  resetSessionHydrated: () => void
}

export const useDesktopRuntimeStore = create<DesktopRuntimeStore>((set) => ({
  status: null,
  runtimeChecked: false,
  sessionHydrated: false,
  setStatus: (status) => set({ status }),
  markRuntimeChecked: () => set({ runtimeChecked: true }),
  markSessionHydrated: () => set({ sessionHydrated: true }),
  resetSessionHydrated: () => set({ sessionHydrated: false }),
}))
