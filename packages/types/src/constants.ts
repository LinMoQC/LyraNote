/**
 * @file 共享枚举与常量类型
 * @description 三端（Web / Desktop / Mobile）共用的枚举类型。
 *              与具体运行时无关，不依赖任何平台 API。
 */

// ── Chat ─────────────────────────────────────────────────────────────────────

export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

// ── Source ────────────────────────────────────────────────────────────────────

export const SOURCE_TYPES = ["pdf", "web", "audio", "doc"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_STATUSES = ["indexed", "processing", "pending", "failed"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

// ── Notebook ─────────────────────────────────────────────────────────────────

export const NOTEBOOK_STATUSES = ["active", "draft"] as const;
export type NotebookStatus = (typeof NOTEBOOK_STATUSES)[number];

// ── Artifact ─────────────────────────────────────────────────────────────────

export const ARTIFACT_TYPES = ["outline", "summary", "mindmap"] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATUSES = ["ready", "generating"] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

// ── Agent ────────────────────────────────────────────────────────────────────

export const AGENT_STEP_TYPES = ["thought", "tool_call", "tool_result"] as const;
export type AgentStepType = (typeof AGENT_STEP_TYPES)[number];

// ── Polling intervals (ms) ───────────────────────────────────────────────────

export const REFETCH_INTERVAL_PROCESSING = 5000;
export const REFETCH_INTERVAL_FAST = 3000;
export const INSIGHT_POLL_INTERVAL = 60_000;

// ── Truncation limits ────────────────────────────────────────────────────────

export const TRUNCATE_PREVIEW = 120;
export const TRUNCATE_TITLE = 60;
export const TRUNCATE_AGENT_OUTPUT = 200;
