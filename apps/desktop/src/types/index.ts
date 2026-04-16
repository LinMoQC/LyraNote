/**
 * Desktop type bridge.
 * Re-exports shared types from @lyranote/types and extends them
 * with desktop-specific fields where the API returns more than the shared type captures.
 */

export type { AuthUser, Notebook, Message, ConversationRecord } from "@lyranote/types"
export type { SourceType, SourceStatus } from "@lyranote/types/constants"

import type { Source as SharedSource } from "@lyranote/types"

// ── Message rendering types (mirrors apps/web/src/types/index.ts) ─────────────

export interface CitationData {
  source_id: string
  chunk_id: string
  source_title: string
  excerpt: string
  score?: number
}

export interface MindMapNode {
  label: string
  children?: MindMapNode[]
}

export interface MindMapData {
  title: string
  branches: MindMapNode[]
}

export interface DiagramData {
  xml: string
  title?: string
}

export interface MCPResultData {
  tool: string
  data?: unknown
  html_content?: string
}

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
