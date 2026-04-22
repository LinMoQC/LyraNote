import type { AuthUser } from "@lyranote/types"

import { getDesktopAuthService, getDesktopHttpClient } from "@/lib/api-client"

export async function login(username: string, password: string) {
  return getDesktopAuthService().login({ username, password })
}

export async function getCurrentUser(tokenOverride?: string): Promise<AuthUser> {
  if (!tokenOverride) {
    return getDesktopAuthService().getMe()
  }
  return getDesktopHttpClient().get<AuthUser>("/auth/me", {
    headers: { Authorization: `Bearer ${tokenOverride}` },
  })
}
