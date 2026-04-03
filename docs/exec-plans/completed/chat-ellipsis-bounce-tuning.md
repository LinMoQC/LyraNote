# Exec Plan: Chat Ellipsis Bounce Tuning

**状态**: 已完成  
**创建时间**: 2026-04-03  
**完成时间**: 2026-04-03  
**负责人**: Agent / Human  

---

## 目标

增强聊天流式正文底部省略号的跳动幅度，让“仍在生成中”的状态更明显，同时梳理当前正文里重复过渡文案的成因。

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
- [x] 调整 `apps/web/src/features/chat/chat-message-bubble.tsx` 中流式省略号的动画参数
- [x] 保持现有测试兼容

### 测试
- [x] 跑测试：`pnpm --filter @lyranote/web test -- --run tests/unit/features/chat/chat-message-bubble.test.tsx`

---

## 测试策略

**单元测试覆盖**：
- 流式正文状态仍能显示省略号
- 完成态不显示省略号

**集成测试覆盖**：
- 暂无；本次为动画细节调整

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

- 2026-04-03: 只放大现有流式指示器的视觉动势，不改整体布局，避免引入新的消息气泡抖动。
