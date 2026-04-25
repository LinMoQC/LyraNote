import { beforeEach, describe, expect, it, vi } from "vitest"

const tauriMocks = vi.hoisted(() => ({
  check: vi.fn(),
  getVersion: vi.fn(),
  relaunch: vi.fn(),
}))

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: tauriMocks.getVersion,
}))

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: tauriMocks.relaunch,
}))

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: tauriMocks.check,
}))

function setTauriRuntime(enabled: boolean) {
  if (enabled) {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    })
    return
  }

  Reflect.deleteProperty(window, "__TAURI_INTERNALS__")
}

describe("desktop-update-service", () => {
  beforeEach(() => {
    vi.resetModules()
    tauriMocks.check.mockReset()
    tauriMocks.getVersion.mockReset()
    tauriMocks.relaunch.mockReset()
    setTauriRuntime(true)
  })

  it("reports unsupported updates outside Tauri", async () => {
    setTauriRuntime(false)
    const { checkForDesktopUpdate } = await import("@/services/desktop-update-service")

    await expect(checkForDesktopUpdate()).resolves.toEqual(expect.objectContaining({
      supported: false,
      available: false,
      currentVersion: "0.1.0",
    }))
    expect(tauriMocks.check).not.toHaveBeenCalled()
  })

  it("returns available update metadata from Tauri updater", async () => {
    tauriMocks.getVersion.mockResolvedValue("0.1.0")
    tauriMocks.check.mockResolvedValue({
      currentVersion: "0.1.0",
      version: "0.2.0",
      date: "2026-04-23T00:00:00Z",
      body: "Release notes",
      rawJson: { version: "0.2.0" },
    })

    const { checkForDesktopUpdate } = await import("@/services/desktop-update-service")

    await expect(checkForDesktopUpdate()).resolves.toEqual({
      supported: true,
      available: true,
      currentVersion: "0.1.0",
      version: "0.2.0",
      date: "2026-04-23T00:00:00Z",
      body: "Release notes",
      rawJson: { version: "0.2.0" },
    })
    expect(tauriMocks.check).toHaveBeenCalledWith({ timeout: 30000 })
  })

  it("downloads and installs the pending update with progress events", async () => {
    const progress = vi.fn()
    const downloadAndInstall = vi.fn(async (onProgress: (event: unknown) => void) => {
      onProgress({ event: "Started", data: { contentLength: 100 } })
      onProgress({ event: "Progress", data: { chunkLength: 25 } })
      onProgress({ event: "Progress", data: { chunkLength: 75 } })
      onProgress({ event: "Finished" })
    })
    tauriMocks.getVersion.mockResolvedValue("0.1.0")
    tauriMocks.check.mockResolvedValue({
      currentVersion: "0.1.0",
      version: "0.2.0",
      rawJson: {},
      downloadAndInstall,
    })

    const {
      checkForDesktopUpdate,
      downloadAndInstallDesktopUpdate,
    } = await import("@/services/desktop-update-service")

    await checkForDesktopUpdate()
    await downloadAndInstallDesktopUpdate(progress)

    expect(downloadAndInstall).toHaveBeenCalled()
    expect(progress).toHaveBeenNthCalledWith(1, {
      event: "started",
      downloadedBytes: 0,
      totalBytes: 100,
      percent: 0,
    })
    expect(progress).toHaveBeenNthCalledWith(3, {
      event: "progress",
      downloadedBytes: 100,
      totalBytes: 100,
      percent: 100,
    })
    expect(progress).toHaveBeenLastCalledWith({
      event: "finished",
      downloadedBytes: 100,
      totalBytes: 100,
      percent: 100,
    })
  })

  it("relaunches through the Tauri process plugin", async () => {
    const { relaunchDesktopApp } = await import("@/services/desktop-update-service")

    await relaunchDesktopApp()

    expect(tauriMocks.relaunch).toHaveBeenCalled()
  })
})
