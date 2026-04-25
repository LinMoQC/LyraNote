/**
 * @file 共享领域类型定义
 * @description 三端（Web / Desktop / Mobile）共用的核心业务实体类型。
 *              所有类型使用 camelCase 字段命名，与运行时平台无关。
 */

export type {
  ChatRole,
  SourceType,
  SourceStatus,
  NotebookStatus,
  ArtifactType,
  ArtifactStatus,
  AgentStepType,
} from "./constants";

// ── Notebook ──────────────────────────────────────────────────────────────────

import type { NotebookStatus } from "./constants";

/** 笔记本 */
export type Notebook = {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  sourceCount: number;
  noteCount: number;
  artifactCount: number;
  wordCount: number;
  summary?: string;
  status: NotebookStatus;
  isNew?: boolean;
  isPublic?: boolean;
  publishedAt?: string;
  coverEmoji?: string;
  coverGradient?: string;
};

/** 公开笔记本（发布后的简要信息） */
export type PublicNotebook = {
  id: string;
  title: string;
  description: string;
  summary?: string;
  coverEmoji?: string;
  coverGradient?: string;
  sourceCount: number;
  wordCount: number;
  publishedAt?: string;
};

/** 公开笔记内容 */
export type PublicNote = {
  id: string;
  title: string | null;
  contentJson: Record<string, unknown> | null;
  contentText: string | null;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
};

/** 公开笔记本详情（含笔记列表） */
export type PublicNotebookDetail = PublicNotebook & {
  notes: PublicNote[];
};

// ── Source ────────────────────────────────────────────────────────────────────

import type { SourceType, SourceStatus } from "./constants";

/** 知识来源 */
export type Source = {
  id: string;
  notebookId: string;
  title: string;
  type: SourceType;
  summary: string;
  status: SourceStatus;
};

/** 知识来源文本分块 */
export type SourceChunk = {
  id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
};

/** 临时上传文件结果 */
export type UploadTempResult = {
  id: string;
  storage_key: string;
  filename: string;
  content_type: string;
  size: number;
};

// ── Message ───────────────────────────────────────────────────────────────────

import type { ChatRole, AgentStepType } from "./constants";

/** AI 回复中的引用数据 */
export interface CitationData {
  source_id: string;
  chunk_id: string;
  source_title: string;
  excerpt: string;
  score?: number;
}

/** Agent 执行步骤（思考/工具调用/结果） */
export interface AgentStep {
  type: AgentStepType;
  content?: string;
  tool?: string;
  input?: Record<string, unknown>;
  is_system?: boolean;
}

/** 思维导图节点 */
export interface MindMapNode {
  label: string;
  children?: MindMapNode[];
}

/** 思维导图数据 */
export interface MindMapData {
  title: string;
  branches: MindMapNode[];
}

/** draw.io 架构图数据 */
export interface DiagramData {
  xml: string;
  title?: string;
}

/** MCP 工具返回的结构化数据 */
export interface MCPResultData {
  tool: string;
  data?: unknown;
  html_content?: string;
}

/** 对话消息 */
export type Message = {
  id: string;
  role: ChatRole;
  content: string;
  citations?: CitationData[];
  quotedText?: string;
  agentSteps?: AgentStep[];
  mindMap?: MindMapData;
  diagram?: DiagramData;
  mcpResult?: MCPResultData;
};

// ── Artifact ──────────────────────────────────────────────────────────────────

import type { ArtifactType, ArtifactStatus } from "./constants";

/** AI 生成物（摘要、大纲、思维导图等） */
export type Artifact = {
  id: string;
  notebookId: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
};

// ── User ──────────────────────────────────────────────────────────────────────

/** 用户资料 */
export type UserProfile = {
  id: string;
  name: string;
  role: string;
};

/** 用户完整信息（含 OAuth 绑定状态） */
export interface AuthUser {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  has_google?: boolean;
  has_github?: boolean;
}

// ── Note ──────────────────────────────────────────────────────────────────────

/** 笔记 */
export type Note = {
  id: string;
  notebookId: string;
  title: string | null;
  contentJson: Record<string, unknown> | null;
  contentText: string | null;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
};

// ── Conversation ──────────────────────────────────────────────────────────────

/** 对话记录 */
export type ConversationRecord = {
  id: string;
  notebookId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  source?: string;
};

// ── Insight ───────────────────────────────────────────────────────────────────

/** AI 主动洞察 */
export type Insight = {
  id: string;
  content: string;
  read: boolean;
  createdAt: string;
};

// ── Task ──────────────────────────────────────────────────────────────────────

/** 定时任务 */
export type Task = {
  id: string;
  name: string;
  description?: string;
  cron: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
};

// ── MCP ───────────────────────────────────────────────────────────────────────

/** MCP 服务器配置 */
export type McpServer = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
};

// ── Knowledge Graph ───────────────────────────────────────────────────────────

/** 知识图谱节点 */
export type KnowledgeGraphNode = {
  id: string;
  label: string;
  type: string;
};

/** 知识图谱边 */
export type KnowledgeGraphEdge = {
  source: string;
  target: string;
  label?: string;
};

/** 知识图谱数据 */
export type KnowledgeGraph = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
};
