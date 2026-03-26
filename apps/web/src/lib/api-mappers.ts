/**
 * @file API 数据映射器
 * @description 将后端 FastAPI 返回的 snake_case 字段映射为前端 camelCase 类型。
 *              所有 service 层通过这些函数统一进行数据格式转换。
 */
import { SOURCE_STATUSES, type ChatRole, type SourceStatus } from "@/lib/constants";
import type { Artifact, CitationData, Message, Notebook, Source } from "@/types";

type Raw = Record<string, unknown>;

/**
 * 将后端笔记本原始数据映射为前端 Notebook 类型
 * @param raw - 后端返回的原始对象
 * @returns Notebook
 */
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

/**
 * 将后端知识来源原始数据映射为前端 Source 类型
 * @param raw - 后端返回的原始对象
 * @returns Source
 */
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
    metadata: (raw.metadata_ as Record<string, unknown>) ?? undefined,
  };
}

/**
 * 映射后端来源类型字符串到前端枚举值
 * @param type - 后端返回的类型字符串
 * @returns SourceType 枚举值
 */
function mapSourceType(type: string): Source["type"] {
  const m: Record<string, Source["type"]> = { pdf: "pdf", web: "web", md: "doc", note: "doc", audio: "audio" };
  return m[type] ?? "doc";
}

/**
 * 将后端生成物原始数据映射为前端 Artifact 类型
 * @param raw - 后端返回的原始对象
 * @returns Artifact
 */
export function mapArtifact(raw: Raw): Artifact {
  return {
    id: raw.id as string,
    notebookId: raw.notebook_id as string,
    title: (raw.title as string) ?? "",
    type: mapArtifactType(raw.type as string),
    status: (raw.status as string) === "ready" ? "ready" : "generating",
  };
}

/**
 * 映射后端生成物类型字符串到前端枚举值
 * @param type - 后端返回的类型字符串
 * @returns ArtifactType 枚举值
 */
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

/**
 * 将后端消息原始数据映射为前端 Message 类型
 * @param raw - 后端返回的原始对象
 * @returns Message
 */
export function mapMessage(raw: Raw): Message {
  return {
    id: raw.id as string,
    role: raw.role as ChatRole,
    content: raw.content as string,
    citations: (raw.citations as CitationData[] | null) ?? undefined,
  };
}
