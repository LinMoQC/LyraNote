# Exec Plan: Chat Message Bubble Streaming Cursor Regression

**状态**: 已完成  
**创建时间**: 2026-04-23  
**完成时间**: 2026-04-23  
**负责人**: Agent

---

## 目标

修复 `ChatMessageBubble` 单元测试中的流式光标回归，确保助手直接回答流式输出时，内容气泡仍显示流式光标，而思考气泡保持静态。

---

## 背景 & 上下文

- 相关设计文档：无
- 相关 API 端点：无
- 影响范围：前端测试 / 聊天气泡渲染

---

## 任务分解

### 后端
- [x] 无后端改动

### 前端
- [x] 检查 `apps/web/src/features/chat/chat-message-bubble.tsx` 的流式渲染路径
- [x] 修复 `apps/web/tests/unit/features/chat/chat-message-bubble.test.tsx` 与真实 `MarkdownContent` 行为不一致的问题
- [x] 确认无需修改运行时代码，现有 `showCursor` 逻辑已满足预期

### 测试
- [x] 更新前端单元测试：`apps/web/tests/unit/features/chat/chat-message-bubble.test.tsx`
- [x] 跑测试全绿：`cd apps/web && pnpm test -- --run tests/unit/features/chat/chat-message-bubble.test.tsx`

---

## 测试策略

**单元测试覆盖**：
- `ChatMessageBubble`：流式直答时，内容气泡显示一次正文和流式光标，思考气泡不复用正文
- `ChatMessageBubble`：消息完成后不再显示流式光标

**集成测试覆盖**：
- 无

**测试文件位置**：
- `apps/web/tests/unit/features/chat/chat-message-bubble.test.tsx`

---

## 验收标准（全部满足才算完成）

- [x] 失败用例修复并稳定通过
- [x] `cd apps/web && pnpm test -- --run tests/unit/features/chat/chat-message-bubble.test.tsx` 全绿
- [x] 渲染逻辑与现有流式 UI 一致，无需运行时代码改动
- [x] 执行计划随改动一并入库

---

## 决策日志

- 2026-04-23: 先验证测试替身是否正确表达 `MarkdownContent(showCursor)` 的真实行为，再决定是否需要修改运行时代码。
- 2026-04-23: 仅修复测试替身，避免为了配合测试而改动已正确工作的流式渲染逻辑。
