import { beforeEach, describe, expect, it, vi } from "vitest"

const bridgeMocks = vi.hoisted(() => ({
  fileProbeMetadata: vi.fn(),
  fileComputeHash: vi.fn(),
}))

vi.mock("@/lib/desktop-bridge", () => bridgeMocks)

import { computeLocalFileHash, probeLocalFile } from "@/services/native-file-service"

describe("native-file-service", () => {
  beforeEach(() => {
    bridgeMocks.fileProbeMetadata.mockReset()
    bridgeMocks.fileComputeHash.mockReset()
  })

  it("delegates probe and hash operations to the desktop bridge", async () => {
    bridgeMocks.fileProbeMetadata.mockResolvedValue({
      path: "/tmp/demo.pdf",
      name: "demo.pdf",
      is_dir: false,
      size_bytes: 42,
    })
    bridgeMocks.fileComputeHash.mockResolvedValue({
      path: "/tmp/demo.pdf",
      algorithm: "sha256",
      digest: "abc123",
      bytes_processed: 42,
    })

    await expect(probeLocalFile("/tmp/demo.pdf")).resolves.toEqual(
      expect.objectContaining({ name: "demo.pdf" }),
    )
    await expect(computeLocalFileHash("/tmp/demo.pdf")).resolves.toEqual(
      expect.objectContaining({ digest: "abc123" }),
    )

    expect(bridgeMocks.fileProbeMetadata).toHaveBeenCalledWith("/tmp/demo.pdf")
    expect(bridgeMocks.fileComputeHash).toHaveBeenCalledWith("/tmp/demo.pdf")
  })
})
