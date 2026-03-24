/**
 * @file @lyranote/api-client 包入口
 * @description 平台无关的 LyraNote API 客户端，供 Web / Desktop / Mobile 三端复用。
 */

// ── 客户端工厂 ────────────────────────────────────────────────────────────────
export { createHttpClient, HttpClient, CODE_NOT_CONFIGURED } from "./lib/client";
export type { HttpClientConfig, RequestOptions, ApiEnvelope } from "./lib/client";

// ── 路由常量 ──────────────────────────────────────────────────────────────────
export {
  AUTH,
  SETUP,
  CONFIG,
  NOTEBOOKS,
  NOTES,
  SOURCES,
  CONVERSATIONS,
  AI,
  INSIGHTS,
  FEEDBACK,
  TASKS,
  SKILLS,
  MEMORY,
  KNOWLEDGE_GRAPH,
  UPLOADS,
  MCP,
  PUBLIC,
} from "./lib/routes";

// ── 数据映射器 ────────────────────────────────────────────────────────────────
export {
  mapNotebook,
  mapSource,
  mapArtifact,
  mapMessage,
  mapNote,
  mapConversation,
} from "./lib/mappers";

// ── SSE 工具 ──────────────────────────────────────────────────────────────────
export { readSseStream } from "./lib/sse";
export type { SseChunk } from "./lib/sse";

// ── 服务工厂 ──────────────────────────────────────────────────────────────────
export { createAuthService } from "./services/auth";
export type { AuthService, LoginPayload, TokenResponse, AuthUserOut } from "./services/auth";

export { createNotebookService } from "./services/notebooks";
export type { NotebookService, NotebookUpdatePayload } from "./services/notebooks";

export { createNoteService } from "./services/notes";
export type { NoteService, NoteUpdatePayload } from "./services/notes";

export { createSourceService } from "./services/sources";
export type { SourceService } from "./services/sources";

export { createConversationService } from "./services/conversations";
export type {
  ConversationService,
  StreamChatPayload,
} from "./services/conversations";

export {
  createInsightService,
  createSkillService,
  createMemoryService,
  createTaskService,
  createAiService,
} from "./services/ai";
