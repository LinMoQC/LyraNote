# Exec Plan: Chat Remove Empty Content Replace

**状态**: 已完成  
**创建时间**: 2026-04-03  
**完成时间**: 2026-04-03  
**负责人**: Agent / Human  

---

## 目标

移除聊天流式过程中用于清空正文的空 `content_replace` 事件，让工具调用前已经输出的正文过渡文本保留在消息中，不再被清空。

---

## 背景 & 上下文

- 相关设计文档：`docs/ARCHITECTURE.md`
- 相关设计文档：`docs/FRONTEND.md`
- 相关 API 端点：`GET /api/v1/messages/generations/{generation_id}/events`
- 影响范围：前端 / 后端

---

## 任务分解

### 后端
- [x] 修改 `apps/api/app/agents/core/engine.py`
- [x] 修改 `apps/api/app/agents/chat/task_manager.py`
- [x] 保留非空 `content_replace` 的最终内容归一化能力，去掉空字符串清空逻辑

### 前端
- [x] 保持 `content_replace` 兼容处理，但不再依赖空替换事件驱动正文切换

### 测试
- [x] 更新后端单元测试：`apps/api/tests/unit/test_agent_engine_injection.py`
- [x] 更新前端单元测试：`apps/web/tests/unit/hooks/use-chat-stream.test.tsx`
- [x] 跑测试：`pytest apps/api/tests/unit/test_agent_engine_injection.py -q`
- [x] 跑测试：`pnpm --filter @lyranote/web test -- --run tests/unit/hooks/use-chat-stream.test.tsx`

---

## 测试策略

**单元测试覆盖**：
- agent 在先输出 token、后触发工具调用时，不再发出空 `content_replace`
- 前端在收到历史遗留的空 `content_replace` 后，后续 token 仍可继续显示

**集成测试覆盖**：
- 暂无；本次为流式协议与渲染状态机回归修复

**测试文件位置**：
- `apps/api/tests/unit/test_agent_engine_injection.py`
- `apps/web/tests/unit/hooks/use-chat-stream.test.tsx`

---

## 验收标准（全部满足才算完成）

- [x] 功能按预期工作，手动验证通过
- [x] `pytest tests/unit/ -v` 相关测试全绿
- [x] `pnpm test` 相关测试全绿
- [ ] `ruff check .` 无新增报错
- [ ] `pnpm typecheck` 无新增报错
- [ ] PR 描述中有测试覆盖说明

---

## 决策日志

- 2026-04-03: 只移除“空字符串清正文”的 `content_replace` 语义，保留非空替换用于最终内容归一化，避免影响 GenUI 等后处理链路。
