# Exec Plan: Desktop Foundation

**状态**: 进行中  
**创建时间**: 2026-03-31  
**完成时间**: —  
**负责人**: Agent  

---

## 目标

完成 `apps/desktop` 的第一阶段工程基线建设，让桌面端在继续复用现有 FastAPI API 的前提下，具备清晰分层、可测试、可构建、可迭代的基础能力。

---

## 背景 & 上下文

- 相关设计文档：暂无，按 `docs/ARCHITECTURE.md` 与 `docs/FRONTEND.md` 的分层规则实施
- 相关 API 端点：沿用现有 `/api/v1/auth`、`/api/v1/notebooks`、`/api/v1/notes`、`/api/v1/conversations`
- 影响范围：前端（`apps/desktop`）为主，无后端接口变更

---

## 任务分解

### 前端
- [ ] 修复 `apps/desktop` 当前 `typecheck` / `build` 失败项
- [ ] 新增 `src/services/`，封装 auth / notebook / note / conversation 调用
- [ ] 新增 `src/features/`，下沉页面和组件中的业务逻辑
- [ ] 新增 query key 管理，统一桌面端缓存 key
- [ ] 保持 `pages/` 与共享组件尽量薄，保留现有 UI 壳

### 测试
- [ ] 引入 Vitest + React Testing Library + jsdom
- [ ] 增加 desktop 测试配置、测试脚本与测试初始化文件
- [ ] 编写 service 层单元测试
- [ ] 编写核心桌面交互回归测试
- [ ] 跑桌面端 `typecheck` / `build` / `lint` / `test` 全绿

---

## 测试策略

**单元测试覆盖**：
- auth service：登录与 `getMe` 调用
- note service：创建与更新
- conversation service：创建会话与流式消息

**交互测试覆盖**：
- 登录页成功/失败提示
- 侧边栏加载 notebook 并切换选中项
- Notes 页面空状态与选择后状态
- Note 编辑器失焦保存
- AI 面板在未选择 notebook 时禁用，在流式回复时显示状态切换

**测试文件位置**：
- `apps/desktop/tests/unit/services/*.test.ts`
- `apps/desktop/tests/unit/features/**/*.test.tsx`
- `apps/desktop/tests/setup/vitest.setup.ts`

---

## 验收标准（全部满足才算完成）

- [ ] 桌面端现有登录、笔记本列表、笔记编辑、AI 面板功能仍可工作
- [ ] `pnpm --filter @lyranote/desktop typecheck` 全绿
- [ ] `pnpm --filter @lyranote/desktop build` 全绿
- [ ] `pnpm --filter @lyranote/desktop lint` 全绿
- [ ] `pnpm --filter @lyranote/desktop test` 全绿
- [ ] 未引入后端 API、数据库或本地优先架构变更

---

## 决策日志

- 2026-03-31: 第一阶段仅做桌面端工程基线建设，不追求 web 端功能对齐。
- 2026-03-31: 桌面端继续依赖现有 FastAPI `/api/v1` 服务，不引入本地优先或离线同步。
