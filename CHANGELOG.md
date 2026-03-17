# Changelog

All notable changes to LyraNote will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Interactive `lyra` CLI with TUI menu for project management
- `scripts/start.sh` with Docker and local dev modes
- husky + lint-staged pre-commit TypeScript type checking
- `storage_s3_public_url` configuration field to separate internal MinIO endpoint from browser-accessible presigned URL
- Mobile-responsive layout: bottom-fixed chat input on home page, conversation sheet on chat page
- Mobile header right-slot injection system for page-specific actions

### Fixed
- MinIO upload 500 error caused by using `localhost:9000` inside Docker containers (now uses service name `minio:9000`)

### Changed
- Chat page mobile conversation selector replaced with bottom sheet for better UX
- Toolbar labels on mobile replaced with icon-only circular buttons

---

## [0.1.0] - 2025-03-01

### Added
- Initial release of LyraNote
- AI-powered chat with streaming responses and LangGraph agent
- Notebook management with Tiptap rich text editor
- Knowledge base with RAG (pgvector semantic search)
- Deep Research mode for comprehensive AI-generated reports
- Memory system with per-user persistent context
- File upload support (PDF, images, documents) via MinIO
- Scheduled tasks with Celery
- OAuth login (Google, GitHub) + local password auth with JWT
- First-run setup wizard
- Docker Compose dev and production configurations
- Bilingual UI (Chinese / English) with next-intl

[Unreleased]: https://github.com/LinMoQC/LyraNote/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/LinMoQC/LyraNote/releases/tag/v0.1.0
