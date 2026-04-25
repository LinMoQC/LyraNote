import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const updateServiceMocks = vi.hoisted(() => ({
  checkForDesktopUpdate: vi.fn(),
  downloadAndInstallDesktopUpdate: vi.fn(),
  getDesktopAppVersion: vi.fn(),
  relaunchDesktopApp: vi.fn(),
}))

vi.mock("@/services/desktop-update-service", () => updateServiceMocks)

import { DesktopUpdatePanel } from "@/pages/settings/settings-page"

describe("DesktopUpdatePanel", () => {
  beforeEach(() => {
    updateServiceMocks.checkForDesktopUpdate.mockReset()
    updateServiceMocks.downloadAndInstallDesktopUpdate.mockReset()
    updateServiceMocks.getDesktopAppVersion.mockReset()
    updateServiceMocks.relaunchDesktopApp.mockReset()
    updateServiceMocks.getDesktopAppVersion.mockResolvedValue("0.1.0")
  })

  it("shows unsupported state when the updater is unavailable", async () => {
    updateServiceMocks.checkForDesktopUpdate.mockResolvedValue({
      supported: false,
      available: false,
      currentVersion: "0.1.0",
      reason: "当前环境不支持自动更新",
    })

    render(<DesktopUpdatePanel />)

    expect(await screen.findByText("LyraNote Desktop 0.1.0")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }))

    expect(await screen.findByText("当前环境不支持自动更新")).toBeInTheDocument()
  })

  it("downloads an available update and offers relaunch", async () => {
    updateServiceMocks.checkForDesktopUpdate.mockResolvedValue({
      supported: true,
      available: true,
      currentVersion: "0.1.0",
      version: "0.2.0",
      body: "Release notes",
    })
    updateServiceMocks.downloadAndInstallDesktopUpdate.mockImplementation(
      async (onProgress: (progress: unknown) => void) => {
        onProgress({ event: "progress", downloadedBytes: 50, totalBytes: 100, percent: 50 })
        onProgress({ event: "finished", downloadedBytes: 100, totalBytes: 100, percent: 100 })
      },
    )

    render(<DesktopUpdatePanel />)

    fireEvent.click(screen.getByRole("button", { name: "检查更新" }))

    expect(await screen.findByText("v0.2.0")).toBeInTheDocument()
    expect(screen.getByText("Release notes")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "下载并安装" }))

    await waitFor(() => {
      expect(updateServiceMocks.downloadAndInstallDesktopUpdate).toHaveBeenCalled()
    })
    expect(await screen.findByText("更新已安装，重启应用完成升级。")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "重启应用" }))
    expect(updateServiceMocks.relaunchDesktopApp).toHaveBeenCalled()
  })
})
