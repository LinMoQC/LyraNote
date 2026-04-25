import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import type { AuthUser } from "@lyranote/types"

import type {
  DesktopImportResultEvent,
  DesktopFileProbe,
  DesktopHashResult,
  DesktopDiagnosticsBundleMeta,
  DesktopJobProgressEvent,
  DesktopRecentItem,
  DesktopRuntimeEvent,
  DesktopRuntimeStatus,
  DesktopSecretKey,
  DesktopShellEvent,
  DesktopShortcutConfig,
  DesktopWindowKind,
  DesktopWindowRoute,
  WatchFolderRegistration,
} from "@/types"

interface RawSecureSession {
  has_session: boolean
  access_token?: string | null
  user_id?: string | null
  username?: string | null
  user?: AuthUser | null
}

export interface SecureSession {
  hasSession: boolean
  accessToken?: string | null
  userId?: string | null
  username?: string | null
  user?: AuthUser | null
}

export interface SelectedPath {
  path: string
  name: string
  is_dir: boolean
  mime_hint?: string | null
}

export interface DesktopNotification {
  kind: string
  title: string
  body: string
  route?: {
    kind: string
    section?: string | null
    path?: string | null
    source_id?: string | null
    window?: string | null
  }
}

export async function runtimeStatus() {
  return invoke<DesktopRuntimeStatus>("runtime_status")
}

export async function runtimeRestart() {
  return invoke<DesktopRuntimeStatus>("runtime_restart")
}

export async function sessionHydrate(): Promise<SecureSession> {
  const payload = await invoke<RawSecureSession>("session_hydrate")
  return {
    hasSession: payload.has_session,
    accessToken: payload.access_token,
    userId: payload.user_id,
    username: payload.username,
    user: payload.user ?? null,
  }
}

export async function sessionStore(payload: {
  access_token: string
  refresh_token?: string | null
  user_id?: string | null
  username?: string | null
  user?: AuthUser | null
}) {
  return invoke<RawSecureSession>("session_store", { payload })
}

export async function sessionClear() {
  return invoke<void>("session_clear")
}

export async function secureSecretStore(key: string, value: string) {
  return invoke<DesktopSecretKey>("secure_secret_store", { key, value })
}

export async function secureSecretGet(key: string) {
  return invoke<string | null>("secure_secret_get", { key })
}

export async function secureSecretDelete(key: string) {
  return invoke<void>("secure_secret_delete", { key })
}

export async function secureSecretListKeys() {
  return invoke<DesktopSecretKey[]>("secure_secret_list_keys")
}

export async function dialogPickSources() {
  return invoke<SelectedPath[]>("dialog_pick_sources")
}

export async function dialogPickWatchFolder() {
  return invoke<SelectedPath | null>("dialog_pick_watch_folder")
}

export async function fileReveal(path: string) {
  return invoke<void>("file_reveal", { path })
}

export async function notificationShow(notification: DesktopNotification) {
  return invoke<void>("notification_show", { notification })
}

export async function globalShortcutStatus() {
  return invoke<DesktopShortcutConfig>("global_shortcut_status")
}

export async function globalShortcutUpdate(config: DesktopShortcutConfig) {
  return invoke<DesktopShortcutConfig>("global_shortcut_update", { config })
}

export async function trayToggleWatchers() {
  return invoke<DesktopRuntimeStatus>("tray_toggle_watchers")
}

export async function quickCaptureOpen() {
  return invoke<void>("quick_capture_open")
}

export async function windowOpen(
  kind: DesktopWindowKind,
  payload?: DesktopWindowRoute | Record<string, unknown>,
) {
  return invoke<void>("window_open", { kind, payload })
}

export async function windowFocus(label: string) {
  return invoke<void>("window_focus", { label })
}

export async function recentItemsList() {
  return invoke<DesktopRecentItem[]>("recent_items_list")
}

export async function diagnosticsExport() {
  return invoke<DesktopDiagnosticsBundleMeta>("diagnostics_export")
}

export async function fileOpenDefault(path: string) {
  return invoke<void>("file_open_default", { path })
}

export async function fileCopyPath(path: string) {
  return invoke<void>("file_copy_path", { path })
}

export async function fileProbeMetadata(path: string) {
  return invoke<DesktopFileProbe>("file_probe_metadata", { path })
}

export async function fileComputeHash(path: string) {
  return invoke<DesktopHashResult>("file_compute_hash", { path })
}

export async function watchFoldersSync(folders: WatchFolderRegistration[]) {
  return invoke<void>("watch_folders_sync", { folders })
}

export async function listenRuntimeState(
  handler: (status: DesktopRuntimeStatus) => void,
) {
  return listen<DesktopRuntimeStatus>("runtime://state", (event) => {
    handler(event.payload)
  })
}

export async function listenRuntimeEvents(
  handler: (event: DesktopRuntimeEvent) => void,
) {
  return listen<DesktopRuntimeEvent>("runtime://event", (event) => {
    handler(event.payload)
  })
}

export async function listenJobProgress(
  handler: (event: DesktopJobProgressEvent) => void,
) {
  return listen<DesktopJobProgressEvent>("jobs://progress", (event) => {
    handler(event.payload)
  })
}

export async function listenImportResults(
  handler: (event: DesktopImportResultEvent) => void,
) {
  return listen<DesktopImportResultEvent>("import://result", (event) => {
    handler(event.payload)
  })
}

export async function listenWindowFileDrop(
  handler: (paths: string[]) => void,
) {
  const appWindow = getCurrentWindow()
  return appWindow.onDragDropEvent((event) => {
    if (event.payload.type !== "drop") {
      return
    }
    handler(event.payload.paths)
  })
}

export async function listenDesktopWindowRoute(
  handler: (payload: DesktopWindowRoute) => void,
) {
  const appWindow = getCurrentWindow()
  return appWindow.listen<DesktopWindowRoute>("desktop://route", (event) => {
    handler(event.payload)
  })
}

export async function listenDesktopShell(
  handler: (payload: DesktopShellEvent) => void,
) {
  return listen<DesktopShellEvent>("desktop://shell", (event) => {
    handler(event.payload)
  })
}
