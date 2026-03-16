# LyraNote

**LyraNote** 是一款 AI 驱动的个人知识管理与笔记应用，旨在成为用户的"第二大脑"。通过将 RAG 检索增强生成、多步骤 AI Agent、知识图谱和长期记忆融为一体，LyraNote 让用户能够真正与自己的知识库对话。

---

## 功能特性

### 知识管理
- **多格式来源导入** — 支持 PDF 文件、网页 URL、Markdown 文本，自动解析、分块、向量化入库
- **RAG 对话** — AI 基于笔记本内的知识库进行检索增强回答，并附带来源引用
- **知识图谱** — 自动从来源中提取实体与关系，生成可交互的力导向图谱

### AI 助手
- **流式 AI 对话** — 实时 SSE 流式输出，支持多轮上下文对话
- **深度研究 Agent** — 多步骤自主研究，联网搜索并输出结构化研究报告
- **AI 副驾驶** — 悬浮于编辑器旁的 AI 面板，随时与当前笔记本内容互动
- **内联润色** — 在编辑器中 AI 实时提供幽灵文字建议，Tab 键一键接受
- **AI 生成内容** — 一键生成摘要、FAQ、学习指南、简报等结构化文档

### 笔记编辑
- **富文本编辑器** — 基于 Tiptap，支持 Markdown 快捷键、标题、列表、代码块、引用等
- **自动保存** — 编辑内容实时同步至后端
- **公开分享** — 笔记本可生成只读公开链接

### 智能化
- **长期记忆** — AI 跨会话记忆用户偏好与知识点，持续个性化
- **场景感知** — 自动识别对话场景（研究 / 写作 / 学习 / 复习）并切换策略
- **思维导图** — AI 对话中实时渲染思维导图
- **定时任务** — 创建 Cron 自动化任务（每日新闻摘要、知识简报等），通过邮件推送
- **主动洞察** — AI 主动推送与当前内容相关的洞察卡片

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                │
│           Next.js 15 前端 (React 19 + Tiptap + Zustand)         │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP / SSE
┌──────────────────────────────▼──────────────────────────────────┐
│                    FastAPI 后端 (Python 3.12)                    │
│   ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│   │  REST API   │  │  SSE 流式    │  │    Celery Worker      │  │
│   │  路由层     │  │  AI 对话     │  │  （后台 AI 任务）      │  │
│   └──────┬──────┘  └──────┬───────┘  └──────────┬────────────┘  │
│          │                │                     │               │
│   ┌──────▼────────────────▼─────────────────────▼────────────┐  │
│   │                   Agent / Skills 层                       │  │
│   │  ReAct Agent · RAG · 深度研究 · 记忆 · 知识图谱 · 写作    │  │
│   └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         │                    │                    │
┌────────▼──────┐   ┌─────────▼────────┐   ┌──────▼───────────┐
│  PostgreSQL   │   │      Redis       │   │   MinIO / S3     │
│  + pgvector   │   │  (Celery Broker  │   │  (文件对象存储)   │
│  (数据 + 向量) │   │   + 缓存)        │   │                  │
└───────────────┘   └──────────────────┘   └──────────────────┘
```

---

## 技术栈总览

### 后端（`api/`）

| 技术 | 用途 |
|---|---|
| Python 3.12 + FastAPI | 异步 Web 框架 |
| SQLAlchemy 2.0 + asyncpg | 异步 ORM |
| Alembic | 数据库迁移 |
| PostgreSQL 16 + pgvector | 关系数据 + 向量相似度检索 |
| Celery + Redis | 后台异步任务队列 |
| OpenAI SDK | LLM 调用与文本嵌入 |
| LangGraph | 多步骤 Agent 编排 |
| MinIO / S3 | 文件对象存储 |
| Tavily API | 网络搜索工具 |

### 前端（`web/`）

| 技术 | 用途 |
|---|---|
| Next.js 15 (App Router) | React 全栈框架 |
| React 19 + TypeScript | UI 开发 |
| Tailwind CSS | 原子化样式 |
| Tiptap | 富文本编辑器 |
| TanStack Query | 服务端状态与缓存 |
| Zustand | 客户端全局状态 |
| Framer Motion | 动画 |
| react-force-graph-2d | 知识图谱可视化 |
| markmap | 思维导图渲染 |
| next-intl | 国际化（i18n） |

---

## 目录结构

```
LyraNote/
├── api/                    # Python FastAPI 后端
│   ├── app/
│   │   ├── routers/        # 各业务域 API 路由
│   │   ├── agents/         # AI Agent 层
│   │   ├── skills/         # AI 技能插件
│   │   └── providers/      # 外部服务封装
│   ├── alembic/            # 数据库迁移
│   └── requirements.txt
├── web/                    # Next.js 前端
│   └── src/
│       ├── app/            # App Router 页面
│       ├── features/       # 业务功能组件
│       ├── services/       # API 服务层
│       ├── store/          # Zustand 状态
│       └── lib/            # 工具函数
├── docs/                   # 架构与功能文档
├── docker-compose.yml      # 开发环境编排
├── docker-compose.prod.yml # 生产环境编排
├── nginx.prod.conf         # 生产 Nginx 配置
└── start.sh                # 快捷启动脚本
```

---

## 快速开始

### 方式一：Docker Compose（推荐）

确保已安装 Docker 和 Docker Compose。

**1. 配置环境变量**

```bash
cp api/.env.example api/.env
```

打开 `api/.env`，填写以下两个关键变量（其余均有默认值）：

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | 随机字符串，用于签发登录 Token（`openssl rand -hex 32`） |
| `FRONTEND_URL` | 前端地址（**跨域关键**），例如 `https://your-app.vercel.app` 或 `http://localhost:3000` |

> **AI 配置（API Key、模型、存储等）无需在 `.env` 中设置**，首次访问时 Setup Wizard 会引导完成，配置保存在数据库中。

**2. （可选）调整 `docker-compose.yml`**

`docker-compose.yml` 中的数据库密码、端口映射等默认值适合本地开发，生产环境建议修改：

- `db.environment.POSTGRES_PASSWORD` — 数据库密码（同步修改 `api.environment.DATABASE_URL`）
- `minio.environment.MINIO_ROOT_PASSWORD` — MinIO 密码
- `api.ports` — 如需修改后端对外端口（默认 `8000`）
- `web.build.args.NEXT_PUBLIC_API_BASE_URL` — 前端构建时内嵌的 API 地址（仅 Docker 部署前端时有效）

**3. 启动**

```bash
./start.sh
# 或等价：docker compose up -d
```

服务启动后：
- 前端：`http://localhost:3000`
- 后端 API：`http://localhost:8000`
- API 文档：`http://localhost:8000/docs`

其他命令：

```bash
./start.sh logs   # 查看实时日志
./start.sh stop   # 停止所有服务
```

---

### 方式二：本地开发（start.sh local）

适合需要热重载调试的场景。数据层（PostgreSQL + Redis）通过 Docker 自动管理，应用层在本地进程中运行。

```bash
cp api/.env.example api/.env
# 编辑 api/.env，填入必要配置

./start.sh local
```

脚本会自动完成：检测/启动数据库容器 → 创建 Python 虚拟环境 → 安装依赖 → 执行数据库迁移 → 并行启动 FastAPI、Celery Worker 和 Next.js Dev Server。

按 `Ctrl+C` 停止本地进程，数据库容器不受影响。

---

### 方式三：前端 Vercel + 后端服务器

后端通过 Docker Compose 部署在服务器，前端单独部署到 Vercel。

**后端（服务器端）**

```bash
cp api/.env.example api/.env
# 编辑 api/.env：
#   FRONTEND_URL=https://your-app.vercel.app  ← 必须填写 Vercel 域名
#   其他必要配置...

# 仅启动后端相关服务（不含 web 容器）
docker compose up -d db redis minio minio-init api worker
```

确保服务器防火墙开放 `8000` 端口，并建议配置 Nginx 反向代理 + HTTPS。

**前端（Vercel）**

在 Vercel 项目的 **Environment Variables** 中添加：

| 变量 | 值 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://your-server.com/api/v1` |

然后推送代码触发 Vercel 自动部署即可。

---

## 环境变量

### 后端（`api/.env`）

Docker Compose 模式下，数据库/Redis/MinIO 连接信息已由 `docker-compose.yml` 的 `environment` 块覆盖，**无需**在 `.env` 中重复填写。

| 变量 | 说明 | 必填 |
|---|---|---|
| `JWT_SECRET` | JWT 签名密钥（`openssl rand -hex 32`） | ✅ |
| `FRONTEND_URL` | 前端地址，用于 CORS（如 `https://your-app.vercel.app`） | ✅ |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth | 可选 |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth | 可选 |

> **AI 相关配置**（`OPENAI_API_KEY`、`LLM_MODEL`、`EMBEDDING_MODEL`、`TAVILY_API_KEY`、存储后端等）已迁移到数据库，通过首次启动的 **Setup Wizard** 或设置页面管理，无需写入 `.env`。若在 `.env` 中设置，仅作为数据库无值时的 fallback。

### 前端（`web/.env.local`）

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | 后端 API 地址 |
| `NEXT_PUBLIC_USE_MOCK` | 是否使用 Mock 数据（开发调试） |

---

## 基础设施服务

| 服务 | 版本 | 用途 |
|---|---|---|
| PostgreSQL | 16 | 主数据库 + pgvector 向量存储 |
| Redis | 7 | Celery 消息队列 + 缓存 |
| MinIO | latest | 本地 S3 兼容对象存储（文件上传） |

---

## 详细文档

- [后端 README](api/README.md) — FastAPI 后端详细说明
- [前端 README](web/README.md) — Next.js 前端详细说明
