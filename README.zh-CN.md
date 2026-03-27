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
  - [方式一 — 本地开发](#方式一--本地开发)
  - [方式二 — Docker Compose（全栈一体）](#方式二--docker-compose全栈一体)
  - [方式三 — 前端 Vercel + 后端服务器](#方式三--前端-vercel--后端服务器)
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

### 方式一 — 本地开发

适合需要热重载调试的场景。数据层（PostgreSQL + Redis）通过 Docker 自动管理，应用层在本地进程中运行。

```bash
git clone https://github.com/LinMoQC/LyraNote.git
cd LyraNote
./lyra init     # 交互式配置向导，自动生成 api/.env
./lyra local    # 启动本地开发模式
```

CLI 会自动：检测/启动数据库容器 → 创建 Python 虚拟环境 → 安装依赖 → 执行数据库迁移 → 并行启动 FastAPI、Celery Worker、Celery Beat 和 Next.js Dev Server。

按 `Ctrl+C` 停止本地进程，数据库容器不受影响。

---

### 方式二 — Docker Compose（全栈一体）

前端、后端、Worker 及所有基础设施全部运行在容器中，适合快速预览或服务器自托管。

**1. 配置环境变量**

```bash
./lyra init     # 交互式向导，自动生成含所有必填项的 api/.env
```

> 基础设施连接信息（`DATABASE_URL`、`REDIS_URL`、`STORAGE_S3_*`）已由 compose 文件注入，**无需**在 `.env` 中填写。

> **AI 配置**（API Key、模型等）通过首次启动的 Setup Wizard 管理，存储在数据库中，`.env` 中的值仅作 fallback。

**2. 启动（开发环境）**

```bash
./lyra docker   # 通过 Docker Compose 启动全部服务
```

服务启动后：
- **前端**：`http://localhost:3000`
- **后端 API**：`http://localhost:8000`
- **API 文档**：`http://localhost:8000/docs`

```bash
./lyra logs     # 查看实时日志
./lyra stop     # 停止所有服务
```

**3. 部署到生产服务器**

使用 `docker-compose.prod.yml`：只起业务容器；**Web / API 映射到本机 `127.0.0.1:3000` 与 `127.0.0.1:8000`**，请用**宿主机 Nginx** 按 `nginx.system.example.conf` 对外提供 80/443。数据库等仍不对外暴露端口。

```bash
./lyra init     # 选择「生产服务器」模式，自动生成根目录 .env（含域名 + 随机密码）
./lyra prod     # 拉取云端镜像并启动生产环境
```

> `init` 向导会自动生成随机 `JWT_SECRET`、`POSTGRES_PASSWORD` 和 `MINIO_ROOT_PASSWORD`，写入根目录 `.env`，供 `docker-compose.prod.yml` 读取。

打开你的域名（配置好 HTTPS 后多为 `https://your-domain.com`）完成 Setup Wizard 即可。

---

### 方式三 — 前端 Vercel + 后端服务器

后端通过 Docker Compose 部署在服务器，前端单独部署到 Vercel。

**后端（服务器端）**

```bash
./lyra init     # 生成根目录 .env（选择「生产服务器」模式）
docker compose -f docker-compose.prod.yml up -d db redis minio minio-init api worker beat
```

确保防火墙开放宿主机 Nginx 的 `80`/`443`；业务端口仅监听回环，勿对公网放行 3000/8000。

**前端（Vercel）**

在 Vercel 项目的 **Environment Variables** 中添加：

| 变量 | 值 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://your-server.com/api/v1` |

推送代码触发 Vercel 自动部署即可。

---

## ⚙️ 环境变量

### 后端（`api/.env`）

Docker Compose 模式下，基础设施连接信息已由 compose 文件注入，**无需**在 `.env` 中重复填写。

| 变量 | 说明 | 必填 |
|---|---|---|
| `JWT_SECRET` | JWT 签名密钥（`openssl rand -hex 32`） | ✅ |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth | 可选 |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth | 可选 |

> AI 相关配置（`OPENAI_API_KEY`、`LLM_MODEL`、`EMBEDDING_MODEL`、`TAVILY_API_KEY`、存储后端等）已迁移到数据库，通过 **Setup Wizard** 或设置页面管理。若在 `.env` 中设置，仅作为 fallback。

### 前端（`web/.env.local`）

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | 后端 API 地址（仅 Vercel 部署时需要填写） |

---

## ⌨️ 快速启动

**方式 A — 全局安装一次，之后任意目录直接用 `lyra`：**

```bash
npm install -g lyra-cli   # 全局安装 lyra 命令
# 或：cd scripts/lyra-cli && npm link

lyra init     # 交互式向导生成 .env
lyra docker   # Docker Compose 启动全部服务
lyra status   # 查看服务健康状态
lyra logs     # 查看实时日志
lyra stop     # 停止所有服务
```

**方式 B — 无需安装，在项目根目录直接运行：**

```bash
git clone https://github.com/LinMoQC/LyraNote.git
cd LyraNote
./lyra          # 交互式菜单（只需 Node.js，无需 npm install）
```

> **需要 Node.js ≥ 18** 和 Docker。可运行 `node --version` 确认。

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
