import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  onDragDropEventMock: vi.fn(),
  windowListenMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invokeMock,
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listenMock,
}))

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: mocks.onDragDropEventMock,
    listen: mocks.windowListenMock,
  }),
}))

import {
  fileComputeHash,
  fileProbeMetadata,
  globalShortcutStatus,
  secureSecretDelete,
  secureSecretGet,
  secureSecretListKeys,
  secureSecretStore,
  trayToggleWatchers,
} from "@/lib/desktop-bridge"

describe("desktop-bridge", () => {
  beforeEach(() => {
    mocks.invokeMock.mockReset()
    mocks.listenMock.mockReset()
    mocks.onDragDropEventMock.mockReset()
    mocks.windowListenMock.mockReset()
  })

  it("routes secure secret commands through invoke", async () => {
    mocks.invokeMock
      .mockResolvedValueOnce({ key: "openai.api_key", updated_at: "1" })
      .mockResolvedValueOnce("sk-test")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ key: "openai.api_key", updated_at: "1" }])

    await expect(secureSecretStore("openai.api_key", "sk-test")).resolves.toEqual({
      key: "openai.api_key",
      updated_at: "1",
    })
    await expect(secureSecretGet("openai.api_key")).resolves.toBe("sk-test")
    await expect(secureSecretDelete("openai.api_key")).resolves.toBeUndefined()
    await expect(secureSecretListKeys()).resolves.toEqual([
      { key: "openai.api_key", updated_at: "1" },
    ])

    expect(mocks.invokeMock).toHaveBeenNthCalledWith(1, "secure_secret_store", {
      key: "openai.api_key",
      value: "sk-test",
    })
    expect(mocks.invokeMock).toHaveBeenNthCalledWith(2, "secure_secret_get", {
      key: "openai.api_key",
    })
    expect(mocks.invokeMock).toHaveBeenNthCalledWith(3, "secure_secret_delete", {
      key: "openai.api_key",
    })
    expect(mocks.invokeMock).toHaveBeenNthCalledWith(4, "secure_secret_list_keys")
  })

  it("routes native file probe and hashing commands through invoke", async () => {
    mocks.invokeMock
      .mockResolvedValueOnce({
        path: "/tmp/demo.pdf",
        name: "demo.pdf",
        is_dir: false,
        size_bytes: 42,
        extension: "pdf",
        mime_hint: "application/pdf",
        pdf_page_count: 2,
      })
      .mockResolvedValueOnce({
        path: "/tmp/demo.pdf",
        algorithm: "sha256",
        digest: "abc123",
        bytes_processed: 42,
      })

    await expect(fileProbeMetadata("/tmp/demo.pdf")).resolves.toEqual(
      expect.objectContaining({
        name: "demo.pdf",
        pdf_page_count: 2,
      }),
    )
    await expect(fileComputeHash("/tmp/demo.pdf")).resolves.toEqual(
      expect.objectContaining({
        algorithm: "sha256",
        digest: "abc123",
      }),
    )

    expect(mocks.invokeMock).toHaveBeenNthCalledWith(1, "file_probe_metadata", {
      path: "/tmp/demo.pdf",
    })
    expect(mocks.invokeMock).toHaveBeenNthCalledWith(2, "file_compute_hash", {
      path: "/tmp/demo.pdf",
    })
  })

  it("routes watcher pause toggles through invoke", async () => {
    mocks.invokeMock.mockResolvedValueOnce({
      state: "ready",
      mode: "bundled",
      health_url: "http://127.0.0.1:8123/health",
      api_base_url: "http://127.0.0.1:8123/api/v1",
      log_path: "/tmp/logs",
      state_dir: "/tmp/state",
      restart_count: 0,
      watcher_count: 2,
      watchers_paused: true,
    })

    await expect(trayToggleWatchers()).resolves.toEqual(
      expect.objectContaining({
        watchers_paused: true,
        watcher_count: 2,
      }),
    )

    expect(mocks.invokeMock).toHaveBeenCalledWith("tray_toggle_watchers")
  })

  it("loads the current global shortcut config through invoke", async () => {
    mocks.invokeMock.mockResolvedValueOnce({
      accelerator: "CmdOrCtrl+Shift+L",
      action: "quick-capture",
      enabled: true,
      supported: true,
    })

    await expect(globalShortcutStatus()).resolves.toEqual(
      expect.objectContaining({
        accelerator: "CmdOrCtrl+Shift+L",
        supported: true,
      }),
    )

    expect(mocks.invokeMock).toHaveBeenCalledWith("global_shortcut_status")
  })
})
