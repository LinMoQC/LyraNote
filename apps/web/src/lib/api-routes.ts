/**
 * @file 后端 API 路由路径集中定义
 * @description 所有后端 API 的路由路径统一在此管理，避免路径字符串散落在各 service 文件中。
 *              静态路径导出为常量，动态路径导出为函数。
 */

// ── 认证 ──────────────────────────────────────────────────────────────────────

export const AUTH = {
  /** POST - 用户名密码登录 */
  LOGIN: "/auth/login",
  /** POST - 登出 */
  LOGOUT: "/auth/logout",
  /** GET - 获取当前用户信息 */
  ME: "/auth/me",
  /** PATCH - 更新用户资料 */
  PROFILE: "/auth/profile",
  /** PATCH - 修改密码 */
  PASSWORD: "/auth/password",
  /** DELETE - 解绑 OAuth */
  oauthUnbind: (provider: string) => `/auth/oauth/${provider}`,
  /** GET - OAuth 登录跳转 */
  oauthLogin: (provider: string) => `/auth/oauth/${provider}`,
  /** GET - OAuth 绑定跳转 */
  oauthBind: (provider: string) => `/auth/oauth/${provider}/bind`,
} as const;

// ── 初始化向导 ────────────────────────────────────────────────────────────────

export const SETUP = {
  /** GET - 检查是否已完成初始化 */
  STATUS: "/setup/status",
  /** POST - 提交初始化配置 */
  INIT: "/setup/init",
  /** POST - 测试 LLM 连接（临时凭据） */
  TEST_LLM: "/setup/test-llm",
  /** POST - 测试 Embedding 连接（临时凭据） */
  TEST_EMBEDDING: "/setup/test-embedding",
  /** POST - 测试 Reranker 连接（临时凭据） */
  TEST_RERANKER: "/setup/test-reranker",
} as const;

// ── 系统配置 ──────────────────────────────────────────────────────────────────

export const CONFIG = {
  /** GET / PATCH - 读取/更新配置 */
  BASE: "/config",
  /** POST - 测试已保存的 LLM 配置 */
  TEST_LLM: "/config/test-llm",
  /** POST - 测试已保存的小模型配置 */
  TEST_UTILITY_LLM: "/config/test-utility-llm",
  /** POST - 测试已保存的 Embedding 配置 */
  TEST_EMBEDDING: "/config/test-embedding",
  /** POST - 测试已保存的 Reranker 配置 */
  TEST_RERANKER: "/config/test-reranker",
  /** POST - 测试 SMTP 邮件配置 */
  TEST_EMAIL: "/config/test-email",
} as const;

// ── 笔记本 ────────────────────────────────────────────────────────────────────

export const NOTEBOOKS = {
  /** GET / POST - 笔记本列表 / 创建笔记本 */
  LIST: "/notebooks",
  /** GET - 全局笔记本 */
  GLOBAL: "/notebooks/global",
  /** GET / PATCH / DELETE - 单个笔记本 */
  detail: (id: string) => `/notebooks/${id}`,
  /** PATCH - 发布笔记本 */
  publish: (id: string) => `/notebooks/${id}/publish`,
  /** PATCH - 取消发布 */
  unpublish: (id: string) => `/notebooks/${id}/unpublish`,
} as const;

// ── 笔记 ──────────────────────────────────────────────────────────────────────

export const NOTES = {
  /** GET / POST - 笔记本下的笔记列表 / 创建笔记 */
  list: (notebookId: string) => `/notebooks/${notebookId}/notes`,
  /** GET / PATCH / DELETE - 单篇笔记 */
  detail: (noteId: string) => `/notes/${noteId}`,
} as const;

// ── 知识来源 ──────────────────────────────────────────────────────────────────

export const SOURCES = {
  /** GET - 笔记本下的来源列表 */
  list: (notebookId: string) => `/notebooks/${notebookId}/sources`,
  /** POST - 导入 URL 来源 */
  importUrl: (notebookId: string) => `/notebooks/${notebookId}/sources/import-url`,
  /** POST - 上传文件来源 */
  upload: (notebookId: string) => `/notebooks/${notebookId}/sources/upload`,
  /** GET - 全局来源列表 */
  GLOBAL: "/sources/global",
  /** POST - 导入全局 URL 来源 */
  GLOBAL_IMPORT_URL: "/sources/global/import-url",
  /** POST - 上传全局文件来源 */
  GLOBAL_UPLOAD: "/sources/global/upload",
  /** GET - 分页查询所有来源 */
  ALL: "/sources/all",
  /** DELETE - 删除来源 */
  detail: (sourceId: string) => `/sources/${sourceId}`,
  /** GET - 来源的文本分块 */
  chunks: (sourceId: string) => `/sources/${sourceId}/chunks`,
  /** POST - 重新分块 */
  rechunk: (sourceId: string) => `/sources/${sourceId}/rechunk`,
  /** GET - 来源的建议问题 */
  suggestions: (sourceId: string) => `/sources/${sourceId}/suggestions`,
} as const;

// ── 对话 ──────────────────────────────────────────────────────────────────────

export const CONVERSATIONS = {
  /** GET / POST - 笔记本下的对话列表 / 创建对话 */
  list: (notebookId: string) => `/notebooks/${notebookId}/conversations`,
  /** GET / POST - 全局对话列表 / 创建（无笔记本） */
  GLOBAL_LIST: "/conversations",
  /** DELETE - 删除对话 */
  detail: (conversationId: string) => `/conversations/${conversationId}`,
  /** GET - 对话消息列表 */
  messages: (conversationId: string) => `/conversations/${conversationId}/messages`,
  /** POST - 保存消息 */
  saveMessage: (conversationId: string) => `/conversations/${conversationId}/messages/save`,
  /** POST - 流式消息 (SSE) */
  stream: (conversationId: string) => `/conversations/${conversationId}/messages/stream`,
  /** POST - 启动可恢复的消息生成 */
  startGeneration: (conversationId: string) => `/conversations/${conversationId}/messages/generations`,
  /** GET - 消息生成状态 */
  generationStatus: (generationId: string) => `/messages/generations/${generationId}`,
  /** GET - 消息生成事件流 (SSE) */
  generationEvents: (generationId: string, from?: number) =>
    `/messages/generations/${generationId}/events${from !== undefined ? `?from=${from}` : ""}`,
  /** POST - 解决 MCP 工具人工审批 */
  approveTool: (approvalId: string) => `/agent/approve/${approvalId}`,
} as const;

// ── AI 服务 ───────────────────────────────────────────────────────────────────

export const AI = {
  /** POST - 非流式对话 */
  CHAT: "/chat",
  /** POST - Ghost Text 行内补全 */
  SUGGEST: "/ai/suggest",
  /** GET - 推荐提示词 */
  SUGGESTIONS: "/ai/suggestions",
  /** POST - 写作辅助上下文 */
  WRITING_CONTEXT: "/ai/writing-context",
  /** POST - 选中文本改写 */
  REWRITE: "/ai/rewrite",
  /** POST - 行内润色 (SSE) */
  POLISH: "/ai/polish",
  /** POST - 创建深度研究任务 */
  DEEP_RESEARCH: "/ai/deep-research",
  /** POST - 生成研究计划（同步，不创建任务） */
  DEEP_RESEARCH_PLAN: "/ai/deep-research/plan",
  /** POST - 深度研究前置澄清问题 */
  DEEP_RESEARCH_CLARIFY: "/ai/deep-research/clarify",
  /** GET - 深度研究任务状态 */
  deepResearchStatus: (taskId: string) => `/ai/deep-research/${taskId}`,
  /** GET - 深度研究事件流 (SSE) */
  deepResearchEvents: (taskId: string, from?: number) =>
    `/ai/deep-research/${taskId}/events${from ? `?from=${from}` : ""}`,
  /** POST - 保存深度研究网络来源到知识库 */
  deepResearchSaveSources: (taskId: string) => `/ai/deep-research/${taskId}/save-sources`,
  /** GET - 笔记本的生成物列表 */
  artifacts: (notebookId: string) => `/notebooks/${notebookId}/artifacts`,
  /** POST - 触发生成内容物 */
  generateArtifact: (notebookId: string) => `/notebooks/${notebookId}/artifacts/generate`,
  /** GET - 上下文问候语 */
  contextGreeting: (notebookId: string) => `/notebooks/${notebookId}/context-greeting`,
  /** GET - 跨笔记本关联知识 */
  relatedKnowledge: (notebookId: string) => `/notebooks/${notebookId}/related-knowledge`,
} as const;

// ── AI 洞察 ───────────────────────────────────────────────────────────────────

export const INSIGHTS = {
  /** GET - 洞察列表 */
  LIST: "/insights",
  /** POST - 标记单条已读 */
  read: (insightId: string) => `/insights/${insightId}/read`,
  /** POST - 标记全部已读 */
  READ_ALL: "/insights/read-all",
} as const;

// ── 消息反馈 ──────────────────────────────────────────────────────────────────

export const FEEDBACK = {
  /** POST - 提交消息反馈 */
  submit: (messageId: string) => `/messages/${messageId}/feedback`,
  /** GET - 对话的反馈列表 */
  list: (conversationId: string) => `/conversations/${conversationId}/feedback`,
} as const;

// ── 定时任务 ──────────────────────────────────────────────────────────────────

export const TASKS = {
  /** GET / POST - 任务列表 / 创建任务 */
  LIST: "/tasks",
  /** GET / PATCH / DELETE - 单个任务 */
  detail: (taskId: string) => `/tasks/${taskId}`,
  /** POST - 手动触发执行 */
  run: (taskId: string) => `/tasks/${taskId}/run`,
  /** GET - 运行历史 */
  runs: (taskId: string) => `/tasks/${taskId}/runs`,
} as const;

// ── AI 技能 ───────────────────────────────────────────────────────────────────

export const SKILLS = {
  /** GET - 技能列表 */
  LIST: "/skills",
  /** PUT - 切换启用/禁用 */
  toggle: (name: string) => `/skills/${encodeURIComponent(name)}`,
} as const;

// ── AI 记忆 ───────────────────────────────────────────────────────────────────

export const MEMORY = {
  /** GET / PATCH - 记忆文档 */
  DOC: "/memory/doc",
  /** GET - 结构化记忆列表（按类型分组） */
  LIST: "/memory",
  /** PUT - 更新单条记忆 */
  update: (id: string) => `/memory/${id}`,
  /** DELETE - 删除单条记忆 */
  delete: (id: string) => `/memory/${id}`,
} as const;

// ── 知识图谱 ──────────────────────────────────────────────────────────────────

export const KNOWLEDGE_GRAPH = {
  /** GET - 笔记本知识图谱 */
  notebook: (notebookId: string) => `/notebooks/${notebookId}/knowledge-graph`,
  /** GET - 全局知识图谱 */
  GLOBAL: "/knowledge-graph/global",
  /** POST - 重建笔记本图谱 */
  rebuild: (notebookId: string) => `/notebooks/${notebookId}/knowledge-graph/rebuild`,
  /** POST - 重建所有图谱 */
  REBUILD_ALL: "/knowledge-graph/rebuild-all",
  /** GET / DELETE - 单个实体 */
  entity: (entityId: string) => `/knowledge-graph/entities/${entityId}`,
  /** GET - 重建进度 */
  REBUILD_PROGRESS: "/knowledge-graph/rebuild-progress",
} as const;

// ── 文件上传 ──────────────────────────────────────────────────────────────────

export const UPLOADS = {
  /** POST - 临时文件上传 */
  TEMP: "/uploads/temp",
  /** GET - 临时文件预览 */
  tempPreview: (fileId: string) => `/uploads/temp/${fileId}`,
} as const;

// ── MCP 服务器配置 ─────────────────────────────────────────────────────────────

export const MCP = {
  /** GET - 列出当前用户的 MCP 服务器配置 */
  LIST: "/mcp/servers",
  /** POST - 新增 MCP 服务器配置 */
  CREATE: "/mcp/servers",
  /** GET / PUT / DELETE - 单个 MCP 服务器配置 */
  detail: (id: string) => `/mcp/servers/${id}`,
  /** POST - 测试连接并返回可用工具列表 */
  test: (id: string) => `/mcp/servers/${id}/test`,
} as const;

export const PUBLIC = {
  /** GET - 公开笔记本列表 */
  NOTEBOOKS: "/public/notebooks",
  /** GET - 公开笔记本详情 */
  notebook: (id: string) => `/public/notebooks/${id}`,
  /** GET - 公开知识主页 */
  SITE: "/public/site",
} as const;

export const PUBLIC_HOME = {
  /** GET - 当前用户的公开主页状态 */
  BASE: "/public-home",
  /** POST - 生成草稿 */
  GENERATE: "/public-home/generate",
  /** POST - 批准草稿 */
  APPROVE: "/public-home/approve",
  /** POST - 回填当前已批准版本的画像快照 */
  BACKFILL_PORTRAIT: "/public-home/backfill-portrait",
  /** POST - 丢弃草稿 */
  DISCARD: "/public-home/discard",
} as const;

// ── 活动心跳 ──────────────────────────────────────────────────────────────────

export const ACTIVITY = {
  /** POST - 上报用户活动快照 */
  HEARTBEAT: "/activity/heartbeat",
  /** GET - 读取当前活动快照（调试） */
  CURRENT: "/activity/current",
} as const;

// ── 全局 SSE 事件总线 ─────────────────────────────────────────────────────────

export const EVENTS = {
  /** GET - 建立 SSE 长连接（订阅 Lyra 推送） */
  STREAM: "/events/stream",
} as const;

// ── 用户画像 ──────────────────────────────────────────────────────────────────

export const PORTRAIT = {
  /** GET - 获取当前用户画像 */
  ME: "/portrait",
  /** GET - 画像历史版本 */
  HISTORY: "/portrait/history",
  /** POST - 手动触发画像合成（测试用） */
  TRIGGER: "/portrait/trigger",
} as const;
