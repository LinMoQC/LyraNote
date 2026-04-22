# Changelog

All notable changes to LyraNote will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- N/A

### Fixed
- N/A

### Changed
- N/A

---

## [1.0.1] - 2026-04-23

### Added
- LyraNote Desktop 的 macOS 打包与 GitHub Release 自动发布流程
- 桌面端应用内自动更新能力，包括 updater artifacts、签名与 `latest.json` 分发
- 桌面端运行时与本地 sidecar 的发布级集成，支持 Apple Silicon / Intel 双架构构建

### Fixed
- 修复打包后桌面 sidecar 启动不稳定导致的 runtime 卡住问题
- 修复桌面端聊天流式光标回归与 PR #47 的 CI 阻塞问题

### Changed
- Release workflow 调整为 draft-first 流程，并将 CLI npm 发布改为可选步骤
- 桌面端应用图标与 Web 端保持一致

---

## [0.3.0] - 2026-03-26

### Added
- Lyra Soul System（P0-P3）多智能体编排与用户画像能力
- Portrait / Events / Activity 等新领域 API 路由与对应数据模型迁移
- GraphRAG 检索增强、GenUI SSE 组件协议、MCP 集成能力
- `lyra` CLI 与本地/容器启动脚本能力增强
- 前端移动端布局优化（底部输入区与对话选择底部弹层）

### Fixed
- PR #26 CI 阻塞问题：修复前端 `rules-of-hooks` 错误并补充回归测试
- API CI 的 Ruff 步骤收敛为致命规则集，恢复流水线可执行性
- MinIO 容器网络地址导致的上传失败问题（`localhost:9000` -> `minio:9000`）

### Changed
- API 架构重构：agents / workers / models 模块化拆分
- 前端与后端依赖及质量门禁（lint/typecheck/test）流程更新
- Chat 页面移动端交互从下拉切换为底部 Sheet 交互

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

[Unreleased]: https://github.com/LinMoQC/LyraNote/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/LinMoQC/LyraNote/compare/v1.0.0...v1.0.1
[0.3.0]: https://github.com/LinMoQC/LyraNote/compare/v0.2.0...v0.3.0
[0.1.0]: https://github.com/LinMoQC/LyraNote/releases/tag/v0.1.0
