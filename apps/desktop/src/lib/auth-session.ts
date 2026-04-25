import type { AuthUser } from "@lyranote/types"

import { getCurrentUser } from "@/services/auth-service"
import { sessionClear, sessionHydrate, sessionStore } from "@/lib/desktop-bridge"
import { useAuthStore } from "@/store/use-auth-store"

const LEGACY_AUTH_STORAGE_KEY = "lyranote-auth"

type LegacyAuthPayload = {
  state?: {
    token?: string | null
    user?: AuthUser | null
  }
}

export async function hydrateDesktopAuthSession() {
  const current = await sessionHydrate()
  if (current.hasSession && current.accessToken) {
    try {
      let user = current.user ?? null
      if (!user) {
        user = await getCurrentUser(current.accessToken)
      }
      useAuthStore.getState().setAuth(current.accessToken, user)
      clearLegacyAuthStorage()
      return true
    } catch {
      await sessionClear()
      useAuthStore.getState().clearAuth()
    }
  }

  const legacy = readLegacyAuthStorage()
  if (!legacy?.token || !legacy.user) {
    return false
  }

  await persistDesktopAuthSession(legacy.token, legacy.user)
  clearLegacyAuthStorage()
  useAuthStore.getState().setAuth(legacy.token, legacy.user)
  return true
}

export async function persistDesktopAuthSession(token: string, user: AuthUser) {
  await sessionStore({
    access_token: token,
    user_id: user.id,
    username: user.username,
    user,
  })
}

export async function clearDesktopAuthSession() {
  useAuthStore.getState().clearAuth()
  clearLegacyAuthStorage()
  try {
    await sessionClear()
  } catch {
    // Best-effort cleanup; UI state is already cleared.
  }
}

function readLegacyAuthStorage() {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as LegacyAuthPayload
    return {
      token: parsed.state?.token ?? null,
      user: parsed.state?.user ?? null,
    }
  } catch {
    return null
  }
}

function clearLegacyAuthStorage() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
}
