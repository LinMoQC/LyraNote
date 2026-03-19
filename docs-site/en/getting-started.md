# Getting Started

Welcome to LyraNote — an AI-powered personal knowledge management system. This guide will walk you through setting up your own instance in minutes.

## Prerequisites

Before you begin, make sure you have:

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) v2+
- An [OpenAI-compatible API key](https://platform.openai.com/api-keys) (OpenAI, DeepSeek, or Ollama)
- (Optional) A [Tavily API key](https://tavily.com/) for web search in Deep Research

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/LinMoQC/LyraNote.git
cd LyraNote
```

### 2. Configure Environment Variables

```bash
./lyra init
```

The interactive wizard walks you through all required settings and auto-generates `api/.env` — no manual copying or editing needed.

> AI-related config (API keys, models, etc.) can also be set after first login via the Setup Wizard in the UI.

### 3. Start the Application

Use the built-in `lyra` CLI to start all services:

```bash
./lyra docker   # Docker Compose mode (recommended)
# or
./lyra local    # Local process mode (hot reload)
```

> Run `./lyra` with no arguments to open the interactive menu.

This launches:

| Service | Description |
|---|---|
| PostgreSQL 16 | Database with pgvector extension |
| Redis | Task queue and cache |
| MinIO | File object storage |
| FastAPI API | Backend on port `8000` |
| Next.js Web | Frontend on port `3000` |
| Celery Worker | Background task processor |

### 4. Open LyraNote

Navigate to `http://localhost:3000` in your browser.

## Useful CLI Commands

| Command | Description |
|---|---|
| `lyra` or `./lyra` | Interactive menu |
| `lyra init` | Config wizard — generates `.env` |
| `lyra docker` | Start all services via Docker Compose |
| `lyra local` | Local process mode (hot reload) |
| `lyra stop` | Stop all services |
| `lyra logs` | Tail container logs |
| `lyra status` | Check service health |
| `lyra prod` | Production mode (cloud images) |
| `lyra update` | One-click update (git pull + restart) |

## Minimum Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `OPENAI_API_KEY` | LLM API key |
| `OPENAI_BASE_URL` | Override to use DeepSeek / Ollama |
| `LLM_MODEL` | Default: `gpt-4o-mini` |
| `DEBUG` | Set `true` to skip authentication |

## Next Steps

- [AI Chat](./features/ai-chat) — Chat with your knowledge base
- [Knowledge Graph](./features/knowledge-graph) — Visualize entity relationships
- [Deep Research](./features/deep-research) — Run multi-step AI research
- [Scheduled Tasks](./features/scheduled-tasks) — Automate recurring research workflows
- [Deployment](./deployment) — Deploy to a production server
