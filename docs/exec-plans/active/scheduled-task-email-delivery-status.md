# Exec Plan: 定时任务邮件投递状态修复

**状态**: 进行中  
**创建时间**: 2026-03-27  
**完成时间**: —  
**负责人**: Agent

---

## 目标

修复定时任务“内容生成成功但邮件未投递时仍显示成功”的误导状态，让邮件/笔记投递结果与失败原因能够在后端状态和前端界面上被明确看到。

---

## 背景 & 上下文

- 相关后端模块：`apps/api/app/workers/tasks/scheduler.py`、`apps/api/app/providers/email.py`
- 相关前端模块：`apps/web/src/features/tasks/task-card.tsx`、`apps/web/src/features/tasks/task-history-dialog.tsx`
- 影响范围：后端 / 前端

---

## 任务分解

### 后端
- [ ] 为邮件发送结果补充结构化返回值与失败原因
- [ ] 在定时任务执行结果中记录投递状态摘要与错误信息
- [ ] 保持现有任务执行主流程兼容，不引入额外 API 破坏性变更

### 前端
- [ ] 在执行历史中显示投递状态明细
- [ ] 保持任务卡片对最近一次错误的可见性
- [ ] 补充中英文文案

### 测试
- [ ] 编写后端单元测试：覆盖投递状态汇总逻辑
- [ ] 编写前端单元测试：覆盖投递状态展示辅助逻辑
- [ ] 跑测试全绿：`pytest tests/unit/test_scheduler_delivery.py -v` + `pnpm test -- task-delivery.test.ts`

---

## 测试策略

**后端单元测试覆盖**：
- 邮件投递失败时，能生成明确错误摘要
- 多种投递状态组合时，能得到正确的结果摘要与错误信息

**前端单元测试覆盖**：
- `delivery_status` 中的 `sent / failed / skipped` 能映射为正确展示文案 key
- 含 `email_error` 时能显示错误详情

**测试文件位置**：
- `apps/api/tests/unit/test_scheduler_delivery.py`
- `apps/web/src/features/tasks/task-delivery.test.ts`

---

## 验收标准（全部满足才算完成）

- [ ] 邮件发送失败时，任务卡片能显示明确错误
- [ ] 执行历史能显示投递状态而不是仅显示“生成成功”
- [ ] `pytest tests/unit/test_scheduler_delivery.py -v` 全绿
- [ ] `pnpm test -- task-delivery.test.ts` 全绿

---

## 决策日志

- 2026-03-27: 采用“保留任务生成成功语义，但额外暴露投递失败原因”的方案，避免将所有投递问题都算作任务主流程失败，同时消除 UI 误导。
