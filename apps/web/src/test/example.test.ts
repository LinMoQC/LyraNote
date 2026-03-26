/**
 * 示例测试文件，展示如何为 services/ 层编写测试。
 * 实际测试文件请放在被测文件的同目录下，命名为 *.test.tsx。
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// 示例：测试一个纯工具函数
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512 B")
  })

  it("formats kilobytes", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB")
  })

  it("formats megabytes", () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB")
  })
})

// 示例：测试 service 函数（mock HTTP 调用）
describe("Service layer example (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("demonstrates how to mock apiClient", async () => {
    // 在真实测试中，mock @/lib/axios 的 apiClient
    // vi.mock("@/lib/axios", () => ({
    //   apiClient: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) }
    // }))
    expect(true).toBe(true)
  })
})
