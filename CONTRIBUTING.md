# Contributing to LyraNote

Thank you for your interest in contributing to LyraNote! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Branch Naming](#branch-naming)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/LyraNote.git
   cd LyraNote
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/LinMoQC/LyraNote.git
   ```

---

## Development Setup

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ & pnpm 9+
- Python 3.12+

### Quick Start

```bash
# Install git hooks
npm install

# Start the development environment (interactive menu)
./lyra

# Or start directly with Docker
./lyra start

# Or local development mode (hot reload)
./lyra dev
```

### Environment Configuration

```bash
cp api/.env.example api/.env
# Edit api/.env and fill in OPENAI_API_KEY and other required values
```

### Useful Commands

| Command | Description |
|---|---|
| `./lyra dev` | Start in local dev mode with hot reload |
| `./lyra status` | Check service status |
| `./lyra logs api` | Tail API logs |
| `./lyra shell` | Enter API container shell |
| `./lyra migrate` | Run database migrations |
| `./lyra lint` | Run frontend type check |

---

## Branch Naming

Use the following prefixes:

| Prefix | Purpose |
|---|---|
| `feature/` | New feature |
| `fix/` | Bug fix |

Only `feature/` and `fix/` branches are allowed for local commits by the Git hook.

Examples: `feature/notebook-sharing`, `fix/upload-500-error`

---

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`

**Examples:**
```
feat(chat): add conversation history export
fix(upload): resolve MinIO endpoint URL conflict in Docker
docs(api): add storage configuration guide
chore(deps): upgrade next.js to 15.5
```

---

## Pull Request Process

1. **Sync with upstream** before starting:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

3. **Make your changes** — keep commits small and focused

4. **Ensure CI passes locally**:
   ```bash
   # Frontend typecheck
   ./lyra lint

   # API tests (if you have a local Python env)
   cd api && pytest tests/ -v
   ```

5. **Push and open a PR** against `main`:
   ```bash
   git push origin feat/your-feature-name
   ```

6. Fill in the **PR template** completely

7. **Request a review** — PRs require at least one approval before merging

### What Makes a Good PR

- Focused scope — one feature or fix per PR
- Tests for new functionality
- Updated documentation if behavior changes
- No unrelated changes or formatting sweeps

---

## Reporting Bugs

Please use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) issue template and include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Docker version, browser)
- Relevant logs

---

## Requesting Features

Please use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) issue template. Before submitting, please search existing issues to avoid duplicates.

---

## Project Structure

```
LyraNote/
├── api/              # FastAPI backend
│   ├── app/
│   │   ├── agents/   # LangGraph AI agents
│   │   ├── domains/  # Route handlers (one per domain)
│   │   ├── providers/# LLM, storage, email providers
│   │   └── workers/  # Celery background tasks
│   └── tests/        # pytest test suite
├── web/              # Next.js 15 frontend
│   └── src/
│       ├── app/      # App Router pages
│       ├── features/ # Feature-sliced components
│       └── services/ # API client layer
├── docs/             # Architecture and design documents
├── scripts/          # Shell scripts
└── lyra              # CLI entry point
```

---

## Questions?

Feel free to open a [Discussion](https://github.com/LinMoQC/LyraNote/discussions) for questions that don't fit into a bug report or feature request.
