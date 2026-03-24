/**
 * @file API 数据映射器（共享包版本）
 * @description 将后端 FastAPI 返回的 snake_case 字段映射为前端 camelCase 类型。
 */

import { SOURCE_STATUSES } from "@lyranote/types/constants";
import type {
  Artifact,
  CitationData,
  ConversationRecord,
  Message,
  Note,
  Notebook,
  Source,
} from "@lyranote/types";
import type { ChatRole, SourceStatus } from "@lyranote/types/constants";

type Raw = Record<string, unknown>;

export function mapNotebook(raw: Raw): Notebook {
  return {
    id: raw.id as string,
    title: raw.title as string,
    description: (raw.description as string) ?? "",
    updatedAt: (raw.updated_at as string) ?? new Date().toISOString(),
    sourceCount: (raw.source_count as number) ?? 0,
    artifactCount: 0,
    wordCount: (raw.word_count as number) ?? 0,
    summary: (raw.summary_md as string) || undefined,
    status: (raw.status as string) === "active" ? "active" : "draft",
    isNew: (raw.is_new as boolean) ?? false,
    isPublic: (raw.is_public as boolean) ?? false,
    publishedAt: (raw.published_at as string) || undefined,
    coverEmoji: (raw.cover_emoji as string) || undefined,
    coverGradient: (raw.cover_gradient as string) || undefined,
  };
}

export function mapSource(raw: Raw): Source {
  return {
    id: raw.id as string,
    notebookId: raw.notebook_id as string,
    title: (raw.title as string) ?? "Untitled",
    type: mapSourceType(raw.type as string),
    summary: (raw.summary as string) ?? "",
    status: ((SOURCE_STATUSES as readonly string[]).includes(raw.status as string)
      ? raw.status
      : "processing") as SourceStatus,
  };
}

function mapSourceType(type: string): Source["type"] {
  const m: Record<string, Source["type"]> = {
    pdf: "pdf",
    web: "web",
    md: "doc",
    note: "doc",
    audio: "audio",
  };
  return m[type] ?? "doc";
}

export function mapArtifact(raw: Raw): Artifact {
  return {
    id: raw.id as string,
    notebookId: raw.notebook_id as string,
    title: (raw.title as string) ?? "",
    type: mapArtifactType(raw.type as string),
    status: (raw.status as string) === "ready" ? "ready" : "generating",
  };
}

function mapArtifactType(type: string): Artifact["type"] {
  const m: Record<string, Artifact["type"]> = {
    summary: "summary",
    faq: "summary",
    study_guide: "outline",
    briefing: "summary",
    outline: "outline",
    mindmap: "mindmap",
  };
  return m[type] ?? "summary";
}

export function mapMessage(raw: Raw): Message {
  return {
    id: raw.id as string,
    role: raw.role as ChatRole,
    content: raw.content as string,
    citations: (raw.citations as CitationData[] | null) ?? undefined,
  };
}

export function mapNote(raw: Raw): Note {
  return {
    id: raw.id as string,
    notebookId: raw.notebook_id as string,
    title: (raw.title as string) ?? null,
    contentJson: (raw.content_json as Record<string, unknown>) ?? null,
    contentText: (raw.content_text as string) ?? null,
    wordCount: (raw.word_count as number) ?? 0,
    createdAt: (raw.created_at as string) ?? new Date().toISOString(),
    updatedAt: (raw.updated_at as string) ?? new Date().toISOString(),
  };
}

export function mapConversation(raw: Raw): ConversationRecord {
  return {
    id: raw.id as string,
    notebookId: raw.notebook_id as string,
    title: (raw.title as string) ?? "Untitled",
    createdAt: (raw.created_at as string) ?? new Date().toISOString(),
    updatedAt: (raw.updated_at as string) ?? new Date().toISOString(),
    source: (raw.source as string) ?? undefined,
  };
}
