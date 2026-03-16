/**
 * @file 全局常量定义
 * @description 集中管理项目中的 API 地址、模型选项、存储后端、枚举类型及超时/截断等配置常量。
 *              所有魔法数字和重复定义均应收录于此，避免硬编码分散在各文件中。
 */

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * 浏览器端 API 基础地址（NEXT_PUBLIC_*，构建时注入，面向用户浏览器）
 * Docker 部署时应设置为宿主机可访问的地址，如 http://localhost:8000/api/v1
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"

/**
 * 服务端 SSR 内部 API 地址（运行时读取，非 NEXT_PUBLIC_*）
 * Docker 环境下 SSR 发起的请求需要走容器内网（如 http://api:8000/api/v1），
 * 而非浏览器地址（localhost），否则容器内 localhost 指向自身导致 ECONNREFUSED。
 * 本地开发时回退到与 API_BASE 相同的地址。
 */
export const INTERNAL_API_BASE =
  process.env.INTERNAL_API_BASE_URL ?? API_BASE

// ── Model options ────────────────────────────────────────────────────────────

/** 模型选项（下拉框选项结构） */
export interface ModelOption {
  value: string
  label: string
}

/** 可选的大语言模型列表，用于设置页和初始化向导 */
export const LLM_MODELS: ModelOption[] = [
  { value: "gpt-5.4",                      label: "GPT-5.4" },
  { value: "gpt-5.4-pro",                  label: "GPT-5.4 Pro" },
  { value: "gpt-5.2-instant",              label: "GPT-5.2 Instant" },
  { value: "gpt-4o",                       label: "GPT-4o" },
  { value: "gpt-4o-mini",                  label: "GPT-4o Mini" },
  { value: "claude-opus-4-6",              label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6",            label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5",             label: "Claude Haiku 4.5" },
  { value: "deepseek-chat",                label: "DeepSeek V3" },
  { value: "deepseek-reasoner",            label: "DeepSeek R1" },
  { value: "gemini-3.1-pro-preview",       label: "Gemini 3.1 Pro" },
  { value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite" },
]

/** 可选的向量嵌入模型列表 */
export const EMBEDDING_MODELS: ModelOption[] = [
  { value: "text-embedding-3-small", label: "text-embedding-3-small" },
  { value: "text-embedding-3-large", label: "text-embedding-3-large" },
  { value: "text-embedding-ada-002", label: "text-embedding-ada-002" },
]

/** 默认大语言模型 */
export const DEFAULT_LLM_MODEL = "gpt-4o-mini"
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
export const DEFAULT_BASE_URL = "https://api.openai.com/v1"

// ── Storage backends ─────────────────────────────────────────────────────────

/** 支持的文件存储后端类型 */
export const STORAGE_BACKENDS = ["local", "minio", "s3", "oss", "cos"] as const
export type StorageBackend = (typeof STORAGE_BACKENDS)[number]

/** 各存储后端的 Logo 图片路径及尺寸 */
export const STORAGE_LOGO: Record<string, { src: string; w: number; h: number }> = {
  minio: { src: "/icons/minio.svg",        w: 64, h: 24 },
  s3:    { src: "/icons/aws.svg",           w: 48, h: 28 },
  oss:   { src: "/icons/aliyun.svg",        w: 64, h: 14 },
  cos:   { src: "/icons/tencent-cloud.svg", w: 36, h: 24 },
}

// ── Chat ─────────────────────────────────────────────────────────────────────

/** 对话角色枚举 */
export const CHAT_ROLES = ["user", "assistant"] as const
export type ChatRole = (typeof CHAT_ROLES)[number]

// ── Source ────────────────────────────────────────────────────────────────────

/** 知识来源类型枚举 */
export const SOURCE_TYPES = ["pdf", "web", "audio", "doc"] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

/** 知识来源处理状态枚举 */
export const SOURCE_STATUSES = ["indexed", "processing", "pending", "failed"] as const
export type SourceStatus = (typeof SOURCE_STATUSES)[number]

// ── Notebook ─────────────────────────────────────────────────────────────────

/** 笔记本状态枚举 */
export const NOTEBOOK_STATUSES = ["active", "draft"] as const
export type NotebookStatus = (typeof NOTEBOOK_STATUSES)[number]

// ── Artifact ─────────────────────────────────────────────────────────────────

/** AI 生成物类型枚举 */
export const ARTIFACT_TYPES = ["outline", "summary", "mindmap"] as const
export type ArtifactType = (typeof ARTIFACT_TYPES)[number]

/** AI 生成物状态枚举 */
export const ARTIFACT_STATUSES = ["ready", "generating"] as const
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number]

// ── Agent ────────────────────────────────────────────────────────────────────

/** Agent 执行步骤类型枚举 */
export const AGENT_STEP_TYPES = ["thought", "tool_call", "tool_result"] as const
export type AgentStepType = (typeof AGENT_STEP_TYPES)[number]

// ── Timing / intervals (ms) ─────────────────────────────────────────────────

/** 处理中状态的轮询间隔（5秒） */
export const REFETCH_INTERVAL_PROCESSING = 5000
/** 快速轮询间隔（3秒），用于 chunk 加载等场景 */
export const REFETCH_INTERVAL_FAST = 3000
/** 侧栏洞察轮询间隔（60秒） */
export const INSIGHT_POLL_INTERVAL = 60_000

// ── Truncation limits ───────────────────────────────────────────────────────

/** 预览文本截断长度（字符数） */
export const TRUNCATE_PREVIEW = 120
/** 标题截断长度（字符数） */
export const TRUNCATE_TITLE = 60
/** Agent 工具调用输出截断长度（字符数） */
export const TRUNCATE_AGENT_OUTPUT = 200
