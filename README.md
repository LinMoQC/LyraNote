<div align="center">
  <img width="120" alt="LyraNote Logo" src="./web/public/lyra.png">

  <h1>LyraNote</h1>

  <p><strong>Your AI-powered second brain — chat with your knowledge, not just store it.</strong></p>

**English** · [简体中文](./README.zh-CN.md)

[![][github-contributors-shield]][github-contributors-link]
[![][github-forks-shield]][github-forks-link]
[![][github-stars-shield]][github-stars-link]
[![][github-issues-shield]][github-issues-link]
[![][github-license-shield]][github-license-link]

</div>

<details>
<summary><kbd>Table of Contents</kbd></summary>

#### TOC

- [👋 Getting Started](#-getting-started)
- [✨ Features](#-features)
  - [Knowledge Management](#knowledge-management)
  - [AI Assistant](#ai-assistant)
  - [Rich Note Editing](#rich-note-editing)
  - [Smart Automation](#smart-automation)
- [🛠 Tech Stack](#-tech-stack)
- [🏗 Architecture](#-architecture)
- [🛳 Self Hosting](#-self-hosting)
  - [Option 1 — Local Development](#option-1--local-development)
  - [Option 2 — Docker Compose (All-in-one)](#option-2--docker-compose-all-in-one)
  - [Option 3 — Frontend on Vercel + Backend on Server](#option-3--frontend-on-vercel--backend-on-server)
- [⚙️ Environment Variables](#️-environment-variables)
- [⌨️ Quick Start](#️-quick-start)
- [🤝 Contributing](#-contributing)
- [📈 Star History](#-star-history)

####

<br/>

</details>

<br/>

## 👋 Getting Started

**LyraNote** is a modern, AI-powered personal knowledge management app designed to be your *second brain*. By integrating RAG (Retrieval-Augmented Generation), multi-step AI Agents, knowledge graphs, and long-term memory, LyraNote lets you truly *converse* with your own knowledge base — not just search through it.

---

## ✨ Features

### Knowledge Management

- **Multi-format Import** — Ingest PDF files, web URLs, and Markdown text; auto-parsed, chunked, and vectorized into your knowledge base.
- **RAG Conversations** — AI answers questions grounded in your notebook's knowledge base, with source citations.
- **Knowledge Graph** — Automatically extracts entities and relationships from sources and renders an interactive force-directed graph.

### AI Assistant

- **Streaming AI Chat** — Real-time SSE streaming with multi-turn context support.
- **Deep Research Agent** — Multi-step autonomous research: browses the web and produces structured research reports.
- **AI Copilot** — A floating AI panel docked beside the editor, always aware of your current notebook.
- **Inline Ghost Text** — AI suggestions appear inline as you type; press `Tab` to accept.
- **AI-Generated Content** — One-click generation of summaries, FAQs, study guides, briefings, and more.

### Rich Note Editing

- **Rich Text Editor** — Powered by Tiptap with Markdown shortcuts, headings, lists, code blocks, and blockquotes.
- **Auto-save** — Edits sync to the backend in real time.
- **Public Sharing** — Generate a read-only public link for any notebook.

### Smart Automation

- **Long-term Memory** — AI remembers user preferences and knowledge points across sessions for continuous personalization.
- **Scene Awareness** — Automatically detects conversation context (research / writing / learning / review) and adapts strategy.
- **Mind Maps** — Renders interactive mind maps directly inside AI chat.
- **Scheduled Tasks** — Create Cron jobs (daily news digests, knowledge briefings, etc.) with email delivery.
- **Proactive Insights** — AI proactively surfaces insight cards related to your current content.

---

## 🛠 Tech Stack

### Frontend (`web/`)

| Technology | Purpose |
|---|---|
| [Next.js 15](https://nextjs.org/) (App Router) | React full-stack framework |
| [React 19](https://react.dev/) + TypeScript | UI development |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling |
| [Tiptap](https://tiptap.dev/) | Rich text editor |
| [TanStack Query](https://tanstack.com/query) | Server-state management & caching |
| [Zustand](https://zustand-demo.pmnd.rs/) | Client-side global state |
| [Framer Motion](https://www.framer.com/motion/) | Animations |
| [react-force-graph-2d](https://github.com/vasturiano/react-force-graph) | Knowledge graph visualization |
| [markmap](https://markmap.js.org/) | Mind map rendering |
| [next-intl](https://next-intl-docs.vercel.app/) | Internationalization (i18n) |

### Backend (`api/`)

| Technology | Purpose |
|---|---|
| Python 3.12 + [FastAPI](https://fastapi.tiangolo.com/) | Async web framework |
| SQLAlchemy 2.0 + asyncpg | Async ORM |
| Alembic | Database migrations |
| PostgreSQL 16 + pgvector | Relational data + vector similarity search |
| Celery + Redis | Background async task queue |
| OpenAI SDK | LLM calls & text embeddings |
| [LangGraph](https://www.langchain.com/langgraph) | Multi-step Agent orchestration |
| MinIO / S3 | File object storage |
| Tavily API | Web search tool |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                            │
│          Next.js 15 Frontend (React 19 + Tiptap + Zustand)      │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP / SSE
┌──────────────────────────────▼──────────────────────────────────┐
│                   FastAPI Backend (Python 3.12)                  │
│   ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│   │  REST API   │  │  SSE Stream  │  │    Celery Worker      │  │
│   │   Routers   │  │  AI Chat     │  │  (Background AI Tasks)│  │
│   └──────┬──────┘  └──────┬───────┘  └──────────┬────────────┘  │
│          │                │                     │               │
│   ┌──────▼────────────────▼─────────────────────▼────────────┐  │
│   │                  Agent / Skills Layer                     │  │
│   │   ReAct Agent · RAG · Deep Research · Memory · KG · Write │  │
│   └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         │                    │                    │
┌────────▼──────┐   ┌─────────▼────────┐   ┌──────▼───────────┐
│  PostgreSQL   │   │      Redis       │   │   MinIO / S3     │
│  + pgvector   │   │ (Celery Broker   │   │  (File Storage)  │
│ (Data+Vector) │   │   + Cache)       │   │                  │
└───────────────┘   └──────────────────┘   └──────────────────┘
```

---

## 🛳 Self Hosting

### Option 1 — Local Development

Best for hot-reload debugging. The data layer (PostgreSQL + Redis) is managed by Docker; the application layer runs as local processes.

```bash
cp api/.env.example api/.env
# Edit api/.env: set JWT_SECRET at minimum

./start.sh local
```

The script automatically: detects/starts database containers → creates a Python venv → installs dependencies → runs DB migrations → starts FastAPI, Celery Worker, and Next.js Dev Server in parallel.

Press `Ctrl+C` to stop local processes; database containers are unaffected.

---

### Option 2 — Docker Compose (All-in-one)

Runs everything — frontend, backend, worker, and all infrastructure — in containers. Good for a quick full-stack preview or self-hosted server deployment.

**1. Configure environment variables**

```bash
cp api/.env.example api/.env
```

Open `api/.env` and fill in the required variables:

| Variable | Description | Required |
|---|---|---|
| `JWT_SECRET` | JWT signing key (`openssl rand -hex 32`) | ✅ |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth login | Optional |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth login | Optional |

> Infrastructure connection strings (`DATABASE_URL`, `REDIS_URL`, `STORAGE_S3_*`) are already injected by the compose file — no need to set them in `.env`.

> **AI configuration** (API keys, models, etc.) is managed via the Setup Wizard on first launch, stored in the database. `.env` values act only as fallbacks.

**2. Start (development)**

```bash
./start.sh          # uses docker-compose.yml
```

Once running:
- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:8000`
- **API Docs**: `http://localhost:8000/docs`

```bash
./start.sh logs     # tail live logs
./start.sh stop     # stop all services
```

**3. Deploy to production server**

Use `docker-compose.prod.yml` which adds Nginx, disables debug, and omits exposed ports for the database/cache services.

Copy the env files:

```bash
cp api/.env.example api/.env
cp web/.env.local.example web/.env.local
```

Open `docker-compose.prod.yml` and replace the three domain placeholders:

```yaml
APP_BASE_URL: https://your-domain.com
FRONTEND_URL: https://your-domain.com
CORS_ORIGINS: https://your-domain.com
```

Also change the default passwords in the same file before first deploy:

| Location | Variable | Action |
|---|---|---|
| `db.environment` | `POSTGRES_PASSWORD` | Change + update `DATABASE_URL` accordingly |
| `minio.environment` | `MINIO_ROOT_PASSWORD` | Change + update `STORAGE_S3_SECRET_KEY` + `minio-init` |

Then deploy:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Open `https://your-domain.com` and complete the Setup Wizard.

---

### Option 3 — Frontend on Vercel + Backend on Server

Deploy the backend via Docker Compose on your server, and the frontend separately on Vercel.

**Backend (server)**

```bash
cp api/.env.example api/.env
cp web/.env.local.example web/.env.local
# Fill in JWT_SECRET and optionally OAuth keys

# Edit docker-compose.prod.yml:
#   - Set your domain in APP_BASE_URL / FRONTEND_URL / CORS_ORIGINS
#   - Change db/minio default passwords

docker compose -f docker-compose.prod.yml up -d db redis minio minio-init api worker
```

Open port `80` (Nginx) in your firewall. HTTPS via a reverse proxy is strongly recommended.

**Frontend (Vercel)**

Add the following **Environment Variable** in your Vercel project dashboard:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://your-server.com/api/v1` |

Push your code and Vercel will deploy automatically.

---

## ⚙️ Environment Variables

### Backend (`api/.env`)

In Docker Compose mode, infrastructure connection strings are injected by the compose file and do **not** need to be set in `.env`.

| Variable | Description | Required |
|---|---|---|
| `JWT_SECRET` | JWT signing key (`openssl rand -hex 32`) | ✅ |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth | Optional |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth | Optional |

> AI-related config (`OPENAI_API_KEY`, `LLM_MODEL`, `EMBEDDING_MODEL`, `TAVILY_API_KEY`, storage backend, etc.) is stored in the database and managed via the **Setup Wizard** or Settings page. Values in `.env` act only as fallbacks.

### Frontend (`web/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API base URL (only needed for Vercel deployments) |

---

## ⌨️ Quick Start (Manual)

```bash
git clone https://github.com/LinMoQC/LyraNote.git
cd LyraNote
cp api/.env.example api/.env
./start.sh
```

---

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

<a href="https://github.com/LinMoQC/LyraNote/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=LinMoQC/LyraNote" alt="contributors" />
</a>

---

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=LinMoQC/LyraNote&type=Date)](https://star-history.com/#LinMoQC/LyraNote&Date)

---

Copyright © 2026 [LinMoQC](https://github.com/LinMoQC). <br />
This project is [MIT](./LICENSE) licensed.

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
