import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthUser } from "@lyranote/types"

const userFixture: AuthUser = {
  id: "user-1",
  username: "lyra",
  name: "Lyra",
  email: "lyra@example.com",
  avatar_url: null,
}

const bridgeMocks = vi.hoisted(() => ({
  sessionHydrate: vi.fn(),
  sessionStore: vi.fn(),
  sessionClear: vi.fn(),
}))

const authServiceMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}))

vi.mock("@/lib/desktop-bridge", () => bridgeMocks)
vi.mock("@/services/auth-service", () => authServiceMocks)

import {
  clearDesktopAuthSession,
  hydrateDesktopAuthSession,
  persistDesktopAuthSession,
} from "@/lib/auth-session"
import { useAuthStore } from "@/store/use-auth-store"

describe("auth-session", () => {
  beforeEach(() => {
    bridgeMocks.sessionHydrate.mockReset()
    bridgeMocks.sessionStore.mockReset()
    bridgeMocks.sessionClear.mockReset()
    authServiceMocks.getCurrentUser.mockReset()
    useAuthStore.setState({ token: null, user: null })
    window.localStorage.clear()
  })

  it("hydrates secure desktop sessions and clears legacy storage", async () => {
    bridgeMocks.sessionHydrate.mockResolvedValue({
      hasSession: true,
      accessToken: "token-1",
      user: userFixture,
    })
    window.localStorage.setItem("lyranote-auth", JSON.stringify({
      state: { token: "legacy-token", user: { id: "legacy" } },
    }))

    await expect(hydrateDesktopAuthSession()).resolves.toBe(true)

    expect(useAuthStore.getState()).toMatchObject({
      token: "token-1",
      user: userFixture,
    })
    expect(window.localStorage.getItem("lyranote-auth")).toBeNull()
    expect(authServiceMocks.getCurrentUser).not.toHaveBeenCalled()
  })

  it("migrates legacy storage into secure session storage when needed", async () => {
    bridgeMocks.sessionHydrate.mockResolvedValue({
      hasSession: false,
      accessToken: null,
      user: null,
    })
    bridgeMocks.sessionStore.mockResolvedValue(undefined)
    window.localStorage.setItem("lyranote-auth", JSON.stringify({
      state: { token: "legacy-token", user: userFixture },
    }))

    await expect(hydrateDesktopAuthSession()).resolves.toBe(true)

    expect(bridgeMocks.sessionStore).toHaveBeenCalledWith({
      access_token: "legacy-token",
      user_id: "user-1",
      username: "lyra",
      user: userFixture,
    })
    expect(useAuthStore.getState()).toMatchObject({
      token: "legacy-token",
      user: userFixture,
    })
    expect(window.localStorage.getItem("lyranote-auth")).toBeNull()
  })

  it("persists and clears desktop auth sessions through the bridge", async () => {
    bridgeMocks.sessionStore.mockResolvedValue(undefined)
    bridgeMocks.sessionClear.mockResolvedValue(undefined)
    useAuthStore.setState({ token: "token-2", user: userFixture })

    await persistDesktopAuthSession("token-2", userFixture)
    await clearDesktopAuthSession()

    expect(bridgeMocks.sessionStore).toHaveBeenCalledWith({
      access_token: "token-2",
      user_id: "user-1",
      username: "lyra",
      user: userFixture,
    })
    expect(bridgeMocks.sessionClear).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null })
  })
})
