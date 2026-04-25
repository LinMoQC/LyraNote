/**
 * Desktop type bridge.
 * Re-exports shared types from @lyranote/types and extends them
 * with desktop-specific fields where the API returns more than the shared type captures.
 */

export type {
  AuthUser,
  Notebook,
  Message,
  ConversationRecord,
  CitationData,
  MindMapNode,
  MindMapData,
  DiagramData,
  MCPResultData,
  AgentStep,
} from "@lyranote/types"
export type { SourceType, SourceStatus } from "@lyranote/types/constants"

import type { Source as SharedSource } from "@lyranote/types"

export interface MessageAttachment {
  name: string
  type: string
  previewUrl: string | null
}

/**
 * Desktop-augmented Source: extends the shared type with
 * `url` (present on web/URL sources) and `createdAt`
 * which the shared Source omits but the desktop list needs.
 */
export interface Source extends SharedSource {
  url: string | null
  createdAt: string
}

export type DesktopRuntimeState = "starting" | "ready" | "degraded" | "stopped"
export type DesktopJobState = "queued" | "running" | "paused" | "succeeded" | "failed" | "cancelled"
export type DesktopJobKind = "import" | "rechunk" | "sync"
export type DesktopWindowKind = "main" | "quick-capture" | "chat" | "source-detail"

export interface DesktopRuntimeStatus {
  state: DesktopRuntimeState
  mode: string
  health_url: string
  api_base_url: string
  pid?: number | null
  version?: string | null
  last_error?: string | null
  last_exit_reason?: string | null
  last_healthcheck_at?: string | null
  last_heartbeat_at?: string | null
  log_path: string
  state_dir: string
  sidecar_path?: string | null
  restart_count: number
  watcher_count: number
  watchers_paused: boolean
  last_restart_at?: string | null
}

export interface DesktopRuntimeEvent {
  type: string
  payload: Record<string, unknown>
  occurred_at: string
}

export interface DesktopJob {
  id: string
  kind: DesktopJobKind | string
  state: DesktopJobState
  label: string
  progress: number
  message?: string | null
  resource_id?: string | null
  created_at: string
  updated_at: string
}

export interface DesktopJobProgressEvent {
  type: string
  payload: {
    id?: string
    kind?: DesktopJobKind | string
    state?: DesktopJobState
    progress?: number
    message?: string
    resource_id?: string | null
  }
  occurred_at: string
}

export interface WatchFolderRegistration {
  id: string
  path: string
  name: string
  created_at: string
}

export interface DesktopWatchFolder extends WatchFolderRegistration {
  last_synced_at?: string | null
  last_error?: string | null
  is_active: boolean
}

export interface DesktopRecentImport {
  path: string
  source_id?: string | null
  title?: string | null
  imported_at: string
}

export interface DesktopLocalFileInspection {
  state: "new" | "updated" | "unchanged" | "duplicate"
  path: string
  source_id?: string | null
  matched_path?: string | null
  matched_title?: string | null
  sha256?: string | null
}

export interface DesktopShortcutConfig {
  accelerator: string
  action: string
  enabled: boolean
  supported: boolean
}

export interface DesktopNotificationRoute {
  kind: string
  section?: string | null
  path?: string | null
  source_id?: string | null
  window?: string | null
}

export interface DesktopRecentItem {
  kind: string
  title: string
  subtitle?: string | null
  path?: string | null
  source_id?: string | null
  created_at: string
}

export interface DesktopDiagnosticsBundleMeta {
  path: string
  generated_at: string
  log_path: string
}

export interface DesktopSecretKey {
  key: string
  updated_at: string
}

export interface DesktopFileProbe {
  path: string
  name: string
  is_dir: boolean
  size_bytes?: number | null
  extension?: string | null
  mime_hint?: string | null
  created_at?: string | null
  modified_at?: string | null
  pdf_page_count?: number | null
}

export interface DesktopHashResult {
  path: string
  algorithm: string
  digest: string
  bytes_processed: number
}

export interface DesktopWindowRoute {
  section?: string
  showRecentImports?: boolean
  openedPath?: string
  mode?: "note" | "chat"
  initialMessage?: string
  focus?: boolean
}

export interface DesktopShellEvent {
  shortcut: DesktopShortcutConfig
}

export interface DesktopImportResultEvent {
  type: string
  payload: {
    job_id?: string
    source_id?: string
    path?: string
    state?: "queued" | "succeeded" | "failed" | "skipped"
    error?: string
  }
  occurred_at: string
}

export interface DesktopLocalSearchHit {
  chunk_id: string
  source_id: string
  notebook_id: string
  source_title?: string | null
  source_type: string
  chunk_index: number
  content: string
  excerpt: string
  rank?: number | null
  metadata?: Record<string, unknown> | null
}

export interface DesktopLocalSearchResult {
  query: string
  mode: string
  items: DesktopLocalSearchHit[]
}

export interface DesktopLocalAnswerCitation {
  source_id: string
  chunk_id: string
  source_title?: string | null
  excerpt: string
  metadata?: Record<string, unknown> | null
}

export interface DesktopLocalAnswer {
  mode: string
  query: string
  answer: string
  citations: DesktopLocalAnswerCitation[]
}
