# LyraNote API

LyraNote 后端服务，基于 **FastAPI** 构建，提供 RESTful + SSE 流式接口，支持 AI 对话、RAG 检索、知识图谱、长期记忆等核心功能。

---

## 技术栈

| 技术 | 说明 |
|---|---|
| **Python 3.12+** | 运行环境 |
| **FastAPI** | 异步 Web 框架 |
| **SQLAlchemy 2.0 (async)** | ORM |
| **asyncpg** | 异步 PostgreSQL 驱动 |
| **Alembic** | 数据库迁移 |
| **pgvector** | PostgreSQL 向量扩展，用于 RAG 相似度检索 |
| **Celery + Redis** | 异步任务队列（后台 AI 任务） |
| **OpenAI SDK** | LLM 调用与文本嵌入 |
| **LangGraph** | 多步骤 AI Agent 编排 |
| **MinIO / S3** | 对象存储（文件上传） |
| **Tavily** | 网络搜索工具 |

---

## 项目结构

```
api/
├── app/
│   ├── main.py              # 应用入口，路由注册，生命周期管理
│   ├── config.py            # Pydantic Settings，读取 .env 配置
│   ├── models.py            # 所有 SQLAlchemy ORM 模型
│   ├── database.py          # 异步数据库引擎与 Session 工厂
│   ├── auth.py              # JWT 认证工具函数
│   ├── dependencies.py      # FastAPI 依赖注入
│   ├── routers/             # 各业务域路由（见下表）
│   ├── agents/              # AI Agent 层（ReAct、RAG、记忆、研究等）
│   ├── skills/              # 模块化 AI 技能插件
│   ├── providers/           # 外部服务封装（LLM、Embedding、存储、搜索）
│   └── workers/
│       └── tasks.py         # Celery 后台任务
├── alembic/                 # 数据库迁移脚本
├── requirements.txt         # Python 依赖
├── Dockerfile               # 生产镜像
└── .env                     # 本地环境变量（不提交到版本控制）
```

---

## API 路由总览

所有接口均挂载在 `/api/v1/` 前缀下。

| 路由域 | 路径前缀 | 功能 |
|---|---|---|
| `auth` | `/auth` | 登录注册、JWT 刷新、Google/GitHub OAuth |
| `setup` | `/setup` | 首次运行初始化向导 |
| `config` | `/config` | 运行时配置读写 |
| `notebook` | `/notebooks` | 笔记本 CRUD |
| `note` | `/notes` | 笔记 CRUD（富文本 Tiptap JSON） |
| `source` | `/sources` | 来源文档管理（PDF、网页、Markdown） |
| `conversation` | `/conversations` | 对话历史管理 |
| `ai` | `/ai` | 核心 AI 对话（SSE 流式输出） |
| `artifact` | `/artifacts` | AI 生成内容（摘要、FAQ、学习指南） |
| `knowledge` | `/knowledge` | 向量知识库检索 |
| `knowledge_graph` | `/knowledge-graph` | 知识图谱实体与关系管理 |
| `memory` | `/memories` | 用户长期记忆 CRUD |
| `skill` | `/skills` | AI 技能插件管理 |
| `feedback` | `/feedback` | 消息评价（点赞/点踩） |
| `upload` | `/upload` | 文件上传至存储后端 |
| `task` | `/tasks` | 定时任务管理 |
| `public` | `/public` | 公开分享笔记本（只读访问） |

---

## AI Agent 层

`app/agents/` 目录包含多种专用 Agent：

- **ReAct Agent** (`react_agent.py`) — 通用推理-行动循环 Agent
- **RAG 检索** (`retrieval.py`) — 向量检索增强生成
- **长期记忆** (`memory.py` / `memory_extraction.py` / `memory_retrieval.py`) — 用户记忆提取与检索
- **Deep Research** (`deep_research.py`) — 多步骤深度研究 Agent，支持网络搜索
- **写作助手** (`composer.py` / `writing.py`) — AI 辅助写作与文档生成
- **知识图谱提取** (`knowledge_graph.py`) — 从文档中自动提取实体与关系
- **文档摄取** (`ingestion.py`) — PDF / 网页 / Markdown 解析、分块、向量化入库
- **场景检测** (`scene_detector.py`) — 自动判断对话场景（研究 / 写作 / 学习 / 复习）
- **反思与评估** (`reflection.py` / `evaluation.py`) — Agent 自我评估与质量评分

---

## 内置技能（Skills）

`app/skills/` 为插件化架构，内置技能包括：

| 技能 | 功能 |
|---|---|
| `search_knowledge` | 搜索知识库 |
| `web_search` | 网络搜索（Tavily） |
| `summarize` | 内容摘要 |
| `deep_read` | 深度文档阅读 |
| `mind_map` | 生成思维导图 |
| `create_note` | 从对话创建笔记 |
| `compare_sources` | 多来源对比分析 |
| `update_memory_doc` | 更新长期记忆文档 |
| `update_preference` | 更新用户偏好 |
| `scheduled_task` | 创建定时自动化任务 |

---

## 环境变量

复制 `.env.example` 为 `.env` 并填写以下变量：

```env
# 数据库
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/lyranote

# Redis
REDIS_URL=redis://localhost:6379/0

# LLM
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
EMBEDDING_MODEL=text-embedding-3-small

# 认证
JWT_SECRET=your_jwt_secret

# 存储后端（local / minio / s3）
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=./uploads

# OAuth（可选）
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# 网络搜索（可选）
TAVILY_API_KEY=

# 跨域
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=["http://localhost:3000"]
```

---

## 本地开发

### 前置依赖

- Python 3.12+
- PostgreSQL 16（需安装 pgvector 扩展）
- Redis 7

### 安装依赖

```bash
pip install -r requirements.txt
```

### 初始化数据库

```bash
alembic upgrade head
```

### 启动开发服务器

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 启动 Celery Worker

```bash
celery -A app.workers.tasks worker --loglevel=info --concurrency=4
```

---

## Docker 部署

推荐使用项目根目录的 `docker-compose.yml` 一键启动所有服务：

```bash
# 从项目根目录运行
docker compose up -d
```

这将同时启动 PostgreSQL、Redis、MinIO、API 服务器和 Celery Worker。

---

## 接口文档

服务启动后，访问以下地址查看交互式 API 文档：

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
