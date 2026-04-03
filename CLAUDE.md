# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**LyraNote** — AI-powered personal knowledge management app. Users import PDFs/URLs/Markdown, get RAG-based AI chat grounded in their knowledge base, inline writing assistance, and knowledge graph visualization.

**Monorepo**: pnpm + Turborepo — `apps/web` (Next.js 15), `apps/api` (FastAPI), `packages/{api-client,types,cli}`

## Development Commands

### Starting Development

```bash
./lyra local          # Full-stack dev (frontend + backend + Docker services)
./lyra status         # Check service health
./lyra logs           # Tail logs
```

Services: frontend at `http://localhost:3000`, API at `http://localhost:8000`, health at `http://localhost:8000/health`.

### Backend (`apps/api`)

```bash
cd apps/api
pytest tests/unit/ -v                                     # Fast unit tests (no DB, preferred)
pytest tests/ -v --ignore=tests/e2e                       # Full suite (SQLite in-memory if no DATABASE_URL)
pytest tests/ --cov=app --cov-report=term-missing         # Coverage
ruff check .                                              # Lint
ruff check . --fix && ruff format .                       # Fix & format
alembic upgrade head                                      # Apply DB migrations
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 # Dev server only
celery -A app.workers.tasks worker --loglevel=info        # Celery worker
celery -A app.workers.tasks beat --loglevel=info          # Celery beat (scheduler)
```

**E2E tests** require Postgres and must run migrations first:

```bash
export DATABASE_URL=postgresql+asyncpg://lyranote:lyranote@127.0.0.1:5432/lyranote_test
alembic upgrade head
pytest tests/e2e -v --tb=short
```

E2E runs automatically in CI on PR merge — no need to run locally daily.

### Frontend (`apps/web`)

```bash
cd apps/web
pnpm dev              # Dev server
pnpm test             # Run tests once
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage
pnpm typecheck        # TypeScript check
pnpm lint             # ESLint
pnpm lint:fix         # Auto-fix
pnpm format           # Prettier
```

### Monorepo Root

```bash
pnpm build            # Build all (Turborepo)
pnpm test             # Test all (Turborepo)
pnpm docker           # Start via docker-compose
pnpm docker:prod      # Production stack
pnpm docker:stop      # Stop all containers
```

## Architecture

### System Layers

```
Browser
  ↕ HTTP/SSE
Next.js 15 App Router (apps/web)
  ↕ lib/axios.ts
FastAPI (apps/api)  ←→  Celery Workers
  ↕                        ↕
PostgreSQL + pgvector    Redis
  ↕
MinIO / Local FS
```

### Backend Layer Order (dependencies flow downward only)

```
domains/<area>/router.py    ← HTTP only: validate params, call service, return ApiResponse
        ↓
services/<area>_service.py  ← Business logic, transaction boundary
        ↓
models.py                   ← SQLAlchemy ORM (all models in one file by design)
        ↓
providers/                  ← External APIs (LLM, storage, search, embeddings)
agents/ + skills/           ← AI orchestration, called by services not routers
```

### Frontend Layer Order (dependencies flow downward only)

```
app/ (Next.js routes)       ← Thin page entry points
        ↓
features/<domain>/          ← Business logic, hooks, local state
        ↓
components/                 ← Pure display, no API calls
components/ui/              ← Stateless Shadcn/Radix atoms
        ↓
services/                   ← ALL HTTP calls via lib/axios.ts
store/ (Zustand)            ← UI state only; server data goes in TanStack Query
```

## Enforced Rules (violations fail CI)

### Backend

- **Router stays thin**: `domains/` routers must NOT execute DB queries directly — call `services/`
- **Provider isolation**: `openai`/`anthropic`/`litellm`/`boto3` imports only allowed inside `providers/`
- **Unified response envelope**: all responses use `from app.schemas.response import success, fail`
- **Dependency injection**: DB session and current_user via `dependencies.py` FastAPI Depends, never global state
- **Business errors**: raise `AppError` from `exceptions.py`; let unexpected errors bubble to global 500 handler

### Frontend

- **Services isolation**: `features/` and `components/` must NOT call `axios` or `fetch` directly — use `services/`
- **No AI SDKs on frontend**: never `import openai` or any AI SDK in web app
- **No hardcoded API URLs**: all requests go through `lib/axios.ts` baseURL
- **State separation**: server data → TanStack Query; UI state → Zustand
- **RSC first**: default to Server Components; add `"use client"` only at interactive leaf nodes

## Coding Conventions

### Python

- Type annotations required on all function parameters and return values
- `async/await` for all IO; never `time.sleep` (use `asyncio.sleep`)
- Early return / guard clauses; avoid deep nesting
- `snake_case` (variables/functions), `PascalCase` (classes), `UPPER_SNAKE` (constants)
- Single file max ~500 lines; split to submodules beyond that

### TypeScript / React

- `function` keyword for components and pure functions (not `const = () =>`)
- `interface` over `type` (except unions); no `enum` (use `const` objects instead)
- No semicolons (Prettier enforced)
- Boolean variable prefix: `isLoading`, `hasError`, `canEdit`
- Named exports everywhere; `default export` only in `page.tsx` / `layout.tsx`
- Interface/type definitions at end of file
- Directories: `kebab-case`; components: `PascalCase`

## Test Structure

### Backend

```
apps/api/tests/
├── unit/         # No DB, no HTTP — pure logic, fast
├── integration/  # Requires DB — tests service layer
└── e2e/          # Requires DB + HTTP — tests full API endpoints
```

### Frontend

```
apps/web/tests/
├── unit/features/<domain>/       # Component & hook tests
├── integration/components/       # Cross-provider tests
├── contracts/services/           # API response contract tests
├── fixtures/                     # Mock data factories
├── mocks/                        # Axios mocks
└── utils/                        # render-with-providers and helpers
```

`src/` does NOT contain test files — all tests live in `tests/`.

## Workflow for New Features

Before implementing, create an execution plan in `docs/exec-plans/active/<feature-name>.md` using the template at `docs/exec-plans/TEMPLATE.md`. After completion, move it to `docs/exec-plans/completed/`.

Tests must ship in the same PR as feature code. No PR without passing tests.

## Key Reference Docs


| What                     | Where                                  |
| ------------------------ | -------------------------------------- |
| Architecture constraints | `docs/ARCHITECTURE.md`                 |
| Backend conventions      | `docs/BACKEND.md`                      |
| Frontend conventions     | `docs/FRONTEND.md`                     |
| Testing standards        | `docs/QUALITY.md`                      |
| Active execution plans   | `docs/exec-plans/active/`              |
| Known tech debt          | `docs/exec-plans/tech-debt-tracker.md` |
| Feature design docs      | `docs/design-docs/index.md`            |


## LyraNote-Specific Patterns

- **AI streaming**: SSE (`text/event-stream`) from backend; frontend consumes via `ReadableStream` with `AbortController`
- **Inline references**: `[[id]]` format rendered via Tiptap custom nodes
- **Editor autosave**: must debounce with visual feedback
- **Response envelope**: `{"code": 0, "data": ..., "message": "ok"}` from `success()` / `fail()`
- **Agent calls**: routed through `AgentEngine` in `agents/core/engine.py`, called from service layer
- **Background jobs**: Celery tasks in `workers/tasks.py` via Redis broker

