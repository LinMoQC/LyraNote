import { fileComputeHash, fileProbeMetadata } from "@/lib/desktop-bridge"

export function probeLocalFile(path: string) {
  return fileProbeMetadata(path)
}

export function computeLocalFileHash(path: string) {
  return fileComputeHash(path)
}
