import { getVersion } from "@tauri-apps/api/app"
import { relaunch } from "@tauri-apps/plugin-process"
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater"

import packageJson from "../../package.json"

export interface DesktopUpdateCheckResult {
  supported: boolean
  available: boolean
  currentVersion: string
  version?: string
  date?: string
  body?: string
  rawJson?: Record<string, unknown>
  reason?: string
}

export interface DesktopUpdateProgress {
  event: "started" | "progress" | "finished"
  downloadedBytes: number
  totalBytes?: number
  percent?: number
}

let pendingUpdate: Update | null = null

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function normalizeError(error: unknown, fallback: string) {
  return error instanceof Error ? error : new Error(fallback)
}

export async function getDesktopAppVersion() {
  if (!isTauriRuntime()) {
    return packageJson.version
  }

  try {
    return await getVersion()
  } catch {
    return packageJson.version
  }
}

export async function checkForDesktopUpdate(): Promise<DesktopUpdateCheckResult> {
  const currentVersion = await getDesktopAppVersion()

  if (!isTauriRuntime()) {
    pendingUpdate = null
    return {
      supported: false,
      available: false,
      currentVersion,
      reason: "当前环境不支持自动更新",
    }
  }

  try {
    const update = await check({ timeout: 30_000 })
    pendingUpdate = update

    if (!update) {
      return {
        supported: true,
        available: false,
        currentVersion,
      }
    }

    return {
      supported: true,
      available: true,
      currentVersion: update.currentVersion || currentVersion,
      version: update.version,
      date: update.date,
      body: update.body,
      rawJson: update.rawJson,
    }
  } catch (error) {
    pendingUpdate = null
    throw normalizeError(error, "检查更新失败")
  }
}

export async function downloadAndInstallDesktopUpdate(
  onProgress?: (progress: DesktopUpdateProgress) => void,
) {
  if (!isTauriRuntime()) {
    throw new Error("当前环境不支持自动更新")
  }

  if (!pendingUpdate) {
    throw new Error("没有可安装的更新，请先检查更新")
  }

  let downloadedBytes = 0
  let totalBytes: number | undefined

  try {
    await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === "Started") {
        downloadedBytes = 0
        totalBytes = event.data.contentLength
        onProgress?.({
          event: "started",
          downloadedBytes,
          totalBytes,
          percent: totalBytes ? 0 : undefined,
        })
        return
      }

      if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength
        onProgress?.({
          event: "progress",
          downloadedBytes,
          totalBytes,
          percent: totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : undefined,
        })
        return
      }

      onProgress?.({
        event: "finished",
        downloadedBytes,
        totalBytes,
        percent: 100,
      })
    })
  } catch (error) {
    throw normalizeError(error, "下载并安装更新失败")
  } finally {
    pendingUpdate = null
  }
}

export async function relaunchDesktopApp() {
  if (!isTauriRuntime()) {
    throw new Error("当前环境不支持重启应用")
  }
  await relaunch()
}
