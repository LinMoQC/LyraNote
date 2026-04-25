# Exec Plan: Desktop Dual Surface UI

**状态**: 已完成  
**创建时间**: 2026-03-31  
**完成时间**: 2026-03-31  
**负责人**: Agent

---

## 目标

将 `apps/desktop` 从功能验证壳重构为参考 ima 的双态桌面工作台，提供统一的首页态与编辑态视觉骨架，同时保留 LyraNote 的品牌识别和当前桌面端核心流程。

---

## 背景 & 上下文

- 相关设计文档：`docs/exec-plans/completed/desktop-foundation.md`
- 相关 API 端点：沿用现有 `/api/v1/auth/*`、`/api/v1/notebooks`、`/api/v1/notes`、`/api/v1/conversations/*`
- 影响范围：前端（`apps/desktop`）

---

## 任务分解

### 前端
- [x] 重构桌面端 UI 状态模型，支持 `home / workspace` 双态与 AI 面板三态
- [x] 重构 `main-layout`，实现 workspace tab bar、utility rail、context rail、primary canvas、AI companion panel 五层骨架
- [x] 重构 notes workspace，提供首页态、编辑态、卡片化 note list 与更强的写作画布层次
- [x] 重构 AI assistant panel，支持建议态、聊天态和收起态
- [x] 升级全局设计 token、暗色主题层级、标题栏与交互细节

### 测试
- [x] 更新桌面端 feature 测试，覆盖首页态、编辑态、AI 面板状态切换与主要交互
- [x] 跑测试全绿：`pnpm --filter @lyranote/desktop test`

---

## 测试策略

**单元测试覆盖**：
- `use-ui-store` 驱动的视图切换和 notebook/note 选择联动
- `NotesWorkspace` 的首页态、工作台态和 note 交互
- `AiAssistantPanel` 的默认建议态、聊天态与 notebook 依赖行为

**集成测试覆盖**：
- `MainLayout` 在 notes / knowledge / tasks 不同视图下的壳结构渲染
- 登录后桌面端主界面的关键 UI 区块存在性与状态切换

**测试文件位置**：
- `apps/desktop/tests/unit/features/notes/notes-workspace.test.tsx`
- `apps/desktop/tests/unit/features/ai/ai-assistant-panel.test.tsx`
- `apps/desktop/tests/unit/features/notebooks/notebook-sidebar.test.tsx`

---

## 验收标准（全部满足才算完成）

- [x] 首页态和编辑态都可渲染并保持统一视觉语言
- [x] 中央主画布成为清晰视觉焦点，右侧 AI 区不再为空白死区
- [x] notebook / note 列表从表格感升级为有层次的桌面卡片列表
- [x] `pnpm --filter @lyranote/desktop lint` 全绿
- [x] `pnpm --filter @lyranote/desktop typecheck` 全绿
- [x] `pnpm --filter @lyranote/desktop test` 全绿
- [x] `pnpm --filter @lyranote/desktop build` 全绿

---

## 决策日志

- 2026-03-31: 采用“借 ima 骨架、保留 LyraNote 品牌”的方向，优先同时落首页态和编辑态，避免只美化单页导致桌面整体体验断裂。
- 2026-03-31: 顶部标签栏只承载当前工作上下文，不引入真正的多标签文档管理，先把桌面工作区质感和主流程稳定下来。
