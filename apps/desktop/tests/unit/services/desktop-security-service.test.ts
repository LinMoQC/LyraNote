import { beforeEach, describe, expect, it, vi } from "vitest"

const bridgeMocks = vi.hoisted(() => ({
  secureSecretStore: vi.fn(),
  secureSecretGet: vi.fn(),
  secureSecretDelete: vi.fn(),
  secureSecretListKeys: vi.fn(),
}))

vi.mock("@/lib/desktop-bridge", () => bridgeMocks)

import {
  deleteSecureSecret,
  getSecureSecret,
  listSecureSecrets,
  saveSecureSecret,
} from "@/services/desktop-security-service"

describe("desktop-security-service", () => {
  beforeEach(() => {
    bridgeMocks.secureSecretStore.mockReset()
    bridgeMocks.secureSecretGet.mockReset()
    bridgeMocks.secureSecretDelete.mockReset()
    bridgeMocks.secureSecretListKeys.mockReset()
  })

  it("delegates secret CRUD operations to the desktop bridge", async () => {
    bridgeMocks.secureSecretStore.mockResolvedValue({ key: "openai.api_key", updated_at: "1" })
    bridgeMocks.secureSecretGet.mockResolvedValue("sk-live")
    bridgeMocks.secureSecretDelete.mockResolvedValue(undefined)
    bridgeMocks.secureSecretListKeys.mockResolvedValue([{ key: "openai.api_key", updated_at: "1" }])

    await expect(saveSecureSecret("openai.api_key", "sk-live")).resolves.toEqual({
      key: "openai.api_key",
      updated_at: "1",
    })
    await expect(getSecureSecret("openai.api_key")).resolves.toBe("sk-live")
    await expect(deleteSecureSecret("openai.api_key")).resolves.toBeUndefined()
    await expect(listSecureSecrets()).resolves.toEqual([{ key: "openai.api_key", updated_at: "1" }])

    expect(bridgeMocks.secureSecretStore).toHaveBeenCalledWith("openai.api_key", "sk-live")
    expect(bridgeMocks.secureSecretGet).toHaveBeenCalledWith("openai.api_key")
    expect(bridgeMocks.secureSecretDelete).toHaveBeenCalledWith("openai.api_key")
    expect(bridgeMocks.secureSecretListKeys).toHaveBeenCalledTimes(1)
  })
})
