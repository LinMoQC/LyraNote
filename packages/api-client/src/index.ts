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
export type {
  SourceService,
  SourcePage,
  SourcePageParams,
  SourceUpdatePayload,
  ChunkStrategy,
  SplitterType,
  RechunkOptions,
} from "./services/sources";

export { createConversationService } from "./services/conversations";
export type {
  ConversationService,
  ConversationListParams,
  ConversationMessageParams,
  ConversationStreamPayload,
  ConversationStreamEvent,
} from "./services/conversations";

export { createConfigService } from "./services/config";
export type {
  ConfigService,
  AppConfigMap,
  TestLlmResult,
  TestEmbeddingResult,
  TestRerankerResult,
  TestEmailResult,
} from "./services/config";

export { createMemoryService } from "./services/memory";
export type {
  MemoryService,
  MemoryDocOut,
  MemoryEntry,
  MemoryGrouped,
  MemoryBackfillResult,
} from "./services/memory";

export { createSkillService } from "./services/skills";
export type { SkillService, SkillItem } from "./services/skills";

export { createMcpService } from "./services/mcp";
export type {
  McpService,
  McpServerDetail,
  McpToolInfo,
  McpTestResult,
  CreateMcpServerPayload,
  UpdateMcpServerPayload,
} from "./services/mcp";

export { createUploadService } from "./services/upload";
export type { UploadService } from "./services/upload";

export { lyraQueryKeys } from "./lib/query-keys";
export type {
  ConversationListParams as LyraConversationListParams,
  ConversationMessageParams as LyraConversationMessageParams,
  SourceListParams,
} from "./lib/query-keys";

export {
  createInsightService,
  createTaskService,
  createAiService,
} from "./services/ai";
