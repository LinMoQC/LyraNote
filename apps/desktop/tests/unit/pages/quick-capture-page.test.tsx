import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const desktopBridgeMocks = vi.hoisted(() => ({
  notificationShow: vi.fn(),
  windowOpen: vi.fn(),
}))

const noteServiceMocks = vi.hoisted(() => ({
  createQuickCaptureNote: vi.fn(),
}))

const windowServiceMock = vi.hoisted(() => ({
  label: "quick-capture",
  close: vi.fn(),
}))

vi.mock("@/lib/desktop-bridge", () => desktopBridgeMocks)
vi.mock("@/services/note-service", () => noteServiceMocks)
vi.mock("@/lib/window-service", () => ({
  windowService: windowServiceMock,
}))

import { QuickCapturePage } from "@/pages/quick-capture/quick-capture-page"

describe("QuickCapturePage", () => {
  beforeEach(() => {
    desktopBridgeMocks.notificationShow.mockReset()
    desktopBridgeMocks.windowOpen.mockReset()
    noteServiceMocks.createQuickCaptureNote.mockReset()
    windowServiceMock.close.mockReset()
  })

  it("creates an inbox note and returns to the main window", async () => {
    noteServiceMocks.createQuickCaptureNote.mockResolvedValue({
      title: "Capture title",
    })
    desktopBridgeMocks.windowOpen.mockResolvedValue(undefined)
    desktopBridgeMocks.notificationShow.mockResolvedValue(undefined)
    windowServiceMock.close.mockResolvedValue(undefined)

    render(<QuickCapturePage initialMode="note" />)

    fireEvent.change(screen.getByPlaceholderText(/随手记下研究想法/), {
      target: { value: "整理这篇论文的实验设计" },
    })
    fireEvent.click(screen.getByRole("button", { name: "保存到收件箱" }))

    await waitFor(() => {
      expect(noteServiceMocks.createQuickCaptureNote).toHaveBeenCalledWith("整理这篇论文的实验设计")
    })
    expect(desktopBridgeMocks.windowOpen).toHaveBeenCalledWith("main", {
      section: "notebooks",
      showRecentImports: false,
    })
    expect(windowServiceMock.close).toHaveBeenCalledTimes(1)
  })

  it("opens a dedicated chat window in chat mode", async () => {
    desktopBridgeMocks.windowOpen.mockResolvedValue(undefined)
    windowServiceMock.close.mockResolvedValue(undefined)

    render(<QuickCapturePage initialMode="chat" />)

    fireEvent.click(screen.getByRole("button", { name: "临时聊天" }))
    fireEvent.change(screen.getByPlaceholderText(/输入一段问题/), {
      target: { value: "帮我生成一个阅读提纲" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送到聊天" }))

    await waitFor(() => {
      expect(desktopBridgeMocks.windowOpen).toHaveBeenCalledWith("chat", {
        initialMessage: "帮我生成一个阅读提纲",
      })
    })
    expect(windowServiceMock.close).toHaveBeenCalledTimes(1)
  })
})
