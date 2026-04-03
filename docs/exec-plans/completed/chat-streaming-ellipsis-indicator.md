# Exec Plan: Chat Streaming Ellipsis Indicator

**状态**: 已完成  
**创建时间**: 2026-04-03  
**完成时间**: 2026-04-03  
**负责人**: Agent / Human  

---

## 目标

为聊天中的 assistant 正文气泡增加一个流式生成中的底部跳动省略号，让用户更直观地感知回答仍在继续生成。

---

## 背景 & 上下文

- 相关设计文档：`docs/FRONTEND.md`
- 相关 API 端点：`GET /api/v1/messages/generations/{generation_id}/events`
- 影响范围：前端

---

## 任务分解

### 后端
- [x] 无需改动

### 前端
- [x] 修改 `apps/web/src/features/chat/chat-message-bubble.tsx`
- [x] 仅在 assistant 正文气泡可见且仍在 streaming 时显示底部省略号

### 测试
- [x] 更新 `apps/web/tests/unit/features/chat/chat-message-bubble.test.tsx`
- [x] 跑测试：`pnpm --filter @lyranote/web test -- --run tests/unit/features/chat/chat-message-bubble.test.tsx`

---

## 测试策略

**单元测试覆盖**：
- assistant 流式正文可见时显示省略号
- assistant 完成后不显示省略号

**集成测试覆盖**：
- 暂无；本次为展示层交互细节增强

**测试文件位置**：
- `apps/web/tests/unit/features/chat/chat-message-bubble.test.tsx`

---

## 验收标准（全部满足才算完成）

- [x] 功能按预期工作，手动验证通过
- [x] `pnpm test` 相关测试全绿
- [ ] `pnpm typecheck` 无新增报错
- [ ] PR 描述中有测试覆盖说明

---

## 决策日志

- 2026-04-03: 采用纯前端动画实现流式状态提示，不改后端 SSE 协议，降低实现成本和风险。
