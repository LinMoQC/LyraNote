<div align="center">
  <img width="120" alt="LyraNote Logo" src="./web/public/lyra.png">

  <h1>LyraNote</h1>

  <p><strong>AI 驱动的第二大脑 — 真正与你的知识对话，而不只是存储它。</strong></p>

[English](./README.md) · **简体中文**

[![][github-contributors-shield]][github-contributors-link]
[![][github-forks-shield]][github-forks-link]
[![][github-stars-shield]][github-stars-link]
[![][github-issues-shield]][github-issues-link]
[![][github-license-shield]][github-license-link]

</div>

<details>
<summary><kbd>目录</kbd></summary>

#### TOC

- [👋 项目简介](#-项目简介)
- [✨ 功能特性](#-功能特性)
  - [知识管理](#知识管理)
  - [AI 助手](#ai-助手)
  - [富文本笔记编辑](#富文本笔记编辑)
  - [智能自动化](#智能自动化)
- [🛠 技术栈](#-技术栈)
- [🏗 系统架构](#-系统架构)
- [🛳 部署](#-部署)
  - [Docker Compose（推荐）](#docker-compose推荐)
  - [本地开发](#本地开发)
  - [前端 Vercel + 后端服务器](#前端-vercel--后端服务器)
- [⚙️ 环境变量](#️-环境变量)
- [⌨️ 快速启动](#️-快速启动)
- [🤝 贡献](#-贡献)
- [📈 Star 趋势](#-star-趋势)

####

<br/>

</details>

<br/>

## 👋 项目简介

**LyraNote** 是一款现代 AI 驱动的个人知识管理应用，旨在成为你的「第二大脑」。通过将 RAG 检索增强生成、多步骤 AI Agent、知识图谱与长期记忆融为一体，LyraNote 让你真正*与自己的知识库对话*——而不只是在其中检索。

---

## ✨ 功能特性

### 知识管理

- **多格式来源导入** — 支持 PDF 文件、网页 URL、Markdown 文本，自动解析、分块、向量化入库。
- **RAG 对话** — AI 基于笔记本内的知识库进行检索增强回答，并附带来源引用。
- **知识图谱** — 自动从来源中提取实体与关系，生成可交互的力导向图谱。

### AI 助手

- **流式 AI 对话** — 实时 SSE 流式输出，支持多轮上下文对话。
- **深度研究 Agent** — 多步骤自主研究，联网搜索并输出结构化研究报告。
- **AI 副驾驶** — 悬浮于编辑器旁的 AI 面板，始终感知当前笔记本内容。
- **内联幽灵文字** — 编辑时 AI 实时显示建议，按 `Tab` 一键接受。
- **AI 生成内容** — 一键生成摘要、FAQ、学习指南、简报等结构化文档。

### 富文本笔记编辑

- **富文本编辑器** — 基于 Tiptap，支持 Markdown 快捷键、标题、列表、代码块、引用等。
- **自动保存** — 编辑内容实时同步至后端。
- **公开分享** — 笔记本可生成只读公开链接。

### 智能自动化

- **长期记忆** — AI 跨会话记忆用户偏好与知识点，持续个性化。
- **场景感知** — 自动识别对话场景（研究 / 写作 / 学习 / 复习）并切换策略。
- **思维导图** — AI 对话中实时渲染思维导图。
- **定时任务** — 创建 Cron 自动化任务（每日新闻摘要、知识简报等），通过邮件推送。
- **主动洞察** — AI 主动推送与当前内容相关的洞察卡片。

---

## 🛠 技术栈

### 前端（`web/`）

| 技术 | 用途 |
|---|---|
| [Next.js 15](https://nextjs.org/)（App Router） | React 全栈框架 |
| [React 19](https://react.dev/) + TypeScript | UI 开发 |
| [Tailwind CSS](https://tailwindcss.com/) | 原子化样式 |
| [Tiptap](https://tiptap.dev/) | 富文本编辑器 |
| [TanStack Query](https://tanstack.com/query) | 服务端状态与缓存 |
| [Zustand](https://zustand-demo.pmnd.rs/) | 客户端全局状态 |
| [Framer Motion](https://www.framer.com/motion/) | 动画 |
| [react-force-graph-2d](https://github.com/vasturiano/react-force-graph) | 知识图谱可视化 |
| [markmap](https://markmap.js.org/) | 思维导图渲染 |
| [next-intl](https://next-intl-docs.vercel.app/) | 国际化（i18n） |

### 后端（`api/`）

| 技术 | 用途 |
|---|---|
| Python 3.12 + [FastAPI](https://fastapi.tiangolo.com/) | 异步 Web 框架 |
| SQLAlchemy 2.0 + asyncpg | 异步 ORM |
| Alembic | 数据库迁移 |
| PostgreSQL 16 + pgvector | 关系数据 + 向量相似度检索 |
| Celery + Redis | 后台异步任务队列 |
| OpenAI SDK | LLM 调用与文本嵌入 |
| [LangGraph](https://www.langchain.com/langgraph) | 多步骤 Agent 编排 |
| MinIO / S3 | 文件对象存储 |
| Tavily API | 网络搜索工具 |

---

## 🏗 系统架构

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
│   │   路由层    │  │  AI 对话     │  │  （后台 AI 任务）      │  │
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

## 🛳 部署

### Docker Compose（推荐）

确保已安装 Docker 和 Docker Compose。

**1. 配置环境变量**

```bash
cp api/.env.example api/.env
```

打开 `api/.env`，填写以下两个必填变量（其余均有默认值）：

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | 随机字符串，用于签发登录 Token（`openssl rand -hex 32`） |
| `FRONTEND_URL` | 前端地址（**跨域关键**），例如 `https://your-app.vercel.app` 或 `http://localhost:3000` |

> **AI 配置**（API Key、模型、存储等）无需在 `.env` 中设置，首次访问时 Setup Wizard 会引导完成，配置保存在数据库中。

**2. （可选）调整 `docker-compose.yml`**

`docker-compose.yml` 中的默认值适合本地开发，生产环境建议修改：

- `db.environment.POSTGRES_PASSWORD` — 数据库密码（同步修改 `DATABASE_URL`）
- `minio.environment.MINIO_ROOT_PASSWORD` — MinIO 密码
- `api.ports` — 后端对外端口（默认 `8000`）
- `web.build.args.NEXT_PUBLIC_API_BASE_URL` — 前端构建时内嵌的 API 地址

**3. 启动**

```bash
./start.sh
# 等价于：docker compose up -d
```

服务启动后：
- **前端**：`http://localhost:3000`
- **后端 API**：`http://localhost:8000`
- **API 文档**：`http://localhost:8000/docs`

其他命令：

```bash
./start.sh logs   # 查看实时日志
./start.sh stop   # 停止所有服务
```

---

### 本地开发

适合需要热重载调试的场景。数据层（PostgreSQL + Redis）通过 Docker 自动管理，应用层在本地进程中运行。

```bash
cp api/.env.example api/.env
# 编辑 api/.env，填入必要配置

./start.sh local
```

脚本会自动：检测/启动数据库容器 → 创建 Python 虚拟环境 → 安装依赖 → 执行数据库迁移 → 并行启动 FastAPI、Celery Worker 和 Next.js Dev Server。

按 `Ctrl+C` 停止本地进程，数据库容器不受影响。

---

### 前端 Vercel + 后端服务器

后端通过 Docker Compose 部署在服务器，前端单独部署到 Vercel。

**后端（服务器端）**

```bash
cp api/.env.example api/.env
# 设置 FRONTEND_URL=https://your-app.vercel.app

docker compose up -d db redis minio minio-init api worker
```

确保服务器防火墙开放 `8000` 端口，建议配置 Nginx 反向代理 + HTTPS。

**前端（Vercel）**

在 Vercel 项目的 **Environment Variables** 中添加：

| 变量 | 值 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://your-server.com/api/v1` |

推送代码触发 Vercel 自动部署即可。

---

## ⚙️ 环境变量

### 后端（`api/.env`）

Docker Compose 模式下，数据库 / Redis / MinIO 连接信息已由 `docker-compose.yml` 注入，**无需**在 `.env` 中重复填写。

| 变量 | 说明 | 必填 |
|---|---|---|
| `JWT_SECRET` | JWT 签名密钥（`openssl rand -hex 32`） | ✅ |
| `FRONTEND_URL` | 前端地址，用于 CORS | ✅ |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth | 可选 |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth | 可选 |

> AI 相关配置（`OPENAI_API_KEY`、`LLM_MODEL`、`EMBEDDING_MODEL`、`TAVILY_API_KEY`、存储后端等）已迁移到数据库，通过 **Setup Wizard** 或设置页面管理。若在 `.env` 中设置，仅作为数据库无值时的 fallback。

### 前端（`web/.env.local`）

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | 后端 API 地址 |
| `NEXT_PUBLIC_USE_MOCK` | 是否使用 Mock 数据（开发调试，`true`/`false`） |

---

## ⌨️ 快速启动

```bash
git clone https://github.com/LinMoQC/LyraNote.git
cd LyraNote
cp api/.env.example api/.env
./start.sh
```

---

## 🤝 贡献

欢迎贡献！随时提交 Issue 或 Pull Request。

<a href="https://github.com/LinMoQC/LyraNote/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=LinMoQC/LyraNote" alt="contributors" />
</a>

---

## 📈 Star 趋势

[![Star History Chart](https://api.star-history.com/svg?repos=LinMoQC/LyraNote&type=Date)](https://star-history.com/#LinMoQC/LyraNote&Date)

---

Copyright © 2026 [LinMoQC](https://github.com/LinMoQC). <br />
本项目基于 [MIT](./LICENSE) 协议开源。

<!-- LINK GROUP -->
[github-contributors-shield]: https://img.shields.io/github/contributors/LinMoQC/LyraNote?color=c4f042&labelColor=black&style=flat-square
[github-contributors-link]: https://github.com/LinMoQC/LyraNote/graphs/contributors
[github-forks-shield]: https://img.shields.io/github/forks/LinMoQC/LyraNote?color=8ae8ff&labelColor=black&style=flat-square
[github-forks-link]: https://github.com/LinMoQC/LyraNote/network/members
[github-stars-shield]: https://img.shields.io/github/stars/LinMoQC/LyraNote?color=ffcb47&labelColor=black&style=flat-square
[github-stars-link]: https://github.com/LinMoQC/LyraNote/stargazers
[github-issues-shield]: https://img.shields.io/github/issues/LinMoQC/LyraNote?color=ff80eb&labelColor=black&style=flat-square
[github-issues-link]: https://github.com/LinMoQC/LyraNote/issues
[github-license-shield]: https://img.shields.io/badge/license-MIT-white?labelColor=black&style=flat-square
[github-license-link]: https://github.com/LinMoQC/LyraNote/blob/main/LICENSE
