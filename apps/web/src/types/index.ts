/**
 * @file 全局类型定义
 * @description 前端核心业务实体的 TypeScript 类型定义。
 *              所有类型使用 camelCase 字段命名，通过 api-mappers 从后端 snake_case 转换。
 */
import type {
  AgentStepType,
  ArtifactStatus,
  ArtifactType,
  ChatRole,
  NotebookStatus,
  SourceStatus,
  SourceType,
} from "@/lib/constants";

/** 笔记本 */
export type Notebook = {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  sourceCount: number;
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

/** 知识来源 */
export type Source = {
  id: string;
  notebookId: string;
  title: string;
  type: SourceType;
  summary: string;
  status: SourceStatus;
};

/** AI 回复中的引用数据 */
export interface CitationData {
  source_id: string
  chunk_id: string
  source_title: string
  excerpt: string
  score?: number
}

/** Agent 执行步骤（思考/工具调用/结果） */
export interface AgentStep {
  type: AgentStepType
  content?: string
  tool?: string
  input?: Record<string, unknown>
}

/** 思维导图节点 */
export interface MindMapNode {
  label: string
  children?: MindMapNode[]
}

/** 思维导图数据 */
export interface MindMapData {
  title: string
  branches: MindMapNode[]
}

/** draw.io 架构图数据 */
export interface DiagramData {
  xml: string
  title?: string
}

/** MCP 工具返回的结构化数据（通用，由前端按 tool 名称决定如何渲染） */
export interface MCPResultData {
  tool: string
  /** JSON 数据（来自 plain-JSON 工具结果） */
  data?: unknown
  /** HTML 字符串（来自 EmbeddedResource，用 iframe 渲染） */
  html_content?: string
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

/** AI 生成物（摘要、大纲、思维导图等） */
export type Artifact = {
  id: string;
  notebookId: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
};

/** 用户资料 */
export type UserProfile = {
  id: string;
  name: string;
  role: string;
};
