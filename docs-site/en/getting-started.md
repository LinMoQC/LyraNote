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
cp api/.env.example api/.env
cp web/.env.example web/.env.local
```

Open `api/.env` and set the required values:

```bash
# Required
OPENAI_API_KEY=sk-...
SECRET_KEY=your-random-secret-key

# Optional — switch to a different LLM provider
OPENAI_BASE_URL=https://api.deepseek.com   # or Ollama endpoint
LLM_MODEL=gpt-4o-mini

# Optional — enables Deep Research web search
TAVILY_API_KEY=tvly-...

# Debug mode: skips authentication, no Clerk setup required
DEBUG=true
```

> **Tip:** Set `DEBUG=true` for local development to skip Clerk authentication entirely.

### 3. Start the Application

Use the built-in `lyra` CLI to start all services:

```bash
./lyra start
```

This launches:

| Service | Description |
|---|---|
| PostgreSQL 16 | Database with pgvector extension |
| Redis | Task queue and cache |
| MinIO | File object storage |
| FastAPI API | Backend on port `8000` |
| Next.js Web | Frontend on port `3000` |
| Celery Worker | Background task processor |

### 4. Run Database Migrations

On first start, apply the database schema:

```bash
docker compose exec api alembic upgrade head
```

### 5. Open LyraNote

Navigate to `http://localhost:3000` in your browser.

## Useful CLI Commands

| Command | Description |
|---|---|
| `./lyra start` | Start all services |
| `./lyra dev` | Start in development mode (hot reload) |
| `./lyra stop` | Stop all services |
| `./lyra logs` | Tail logs from all containers |
| `./lyra status` | Check container health |

## Minimum Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `OPENAI_API_KEY` | LLM API key |
| `OPENAI_BASE_URL` | Override to use DeepSeek / Ollama |
| `LLM_MODEL` | Default: `gpt-4o-mini` |
| `DEBUG` | Set `true` to skip Clerk authentication |

## Next Steps

- [AI Chat](./features/ai-chat) — Chat with your knowledge base
- [Knowledge Graph](./features/knowledge-graph) — Visualize entity relationships
- [Deep Research](./features/deep-research) — Run multi-step AI research
- [Scheduled Tasks](./features/scheduled-tasks) — Automate recurring research workflows
- [Deployment](./deployment) — Deploy to a production server
