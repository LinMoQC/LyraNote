# Exec Plan: 本地启动预清理策略

**状态**: 进行中  
**创建时间**: 2026-03-27  
**完成时间**: —  
**负责人**: Agent

---

## 目标

为 `./lyra local` 增加启动前预清理策略，自动清掉 LyraNote 自己遗留的本地 API / Celery 进程，以及误跑的应用层 Docker 容器，避免旧 worker 抢占同一 Redis 队列。

---

## 背景 & 上下文

- 相关启动入口：`packages/cli/src/commands/local.js`
- 相关工具模块：`packages/cli/src/utils/proc.js`
- 相关状态页：`packages/cli/src/commands/status.js`
- 影响范围：CLI / 本地开发运维

---

## 任务分解

### CLI
- [ ] 在 `local.js` 中增加启动前预清理步骤
- [ ] 仅清理 LyraNote 自己的旧进程与应用层容器，不动 DB/Redis/MinIO 数据层
- [ ] 保留端口检查作为最后一道兜底

### 状态展示
- [ ] 在 `status.js` 中纳入 `beat` 容器状态

### 测试 / 验证
- [ ] 用 `node --check` 校验修改后的 CLI 脚本语法
- [ ] 手动验证 `./lyra local` 的预清理行为

---

## 测试策略

**手动验证覆盖**：
- 启动前存在残留 `celery worker/beat` 时，`./lyra local` 会先清理再启动
- 存在 `lyranote-api-1 / worker-1 / beat-1 / web-1` 容器时，仅应用层容器会被停止
- DB/Redis/MinIO 容器与数据不受影响

**脚本验证**：
- `node --check packages/cli/src/commands/local.js`
- `node --check packages/cli/src/commands/status.js`

---

## 验收标准（全部满足才算完成）

- [ ] `./lyra local` 启动前会自动清理旧 API / worker / beat
- [ ] 不会误停数据层容器
- [ ] `status` 可以显示 `beat` 容器
- [ ] CLI 脚本语法校验通过

---

## 决策日志

- 2026-03-27: 预清理范围限定为 LyraNote 自身进程与应用层容器，避免为了清队列问题误伤数据库和缓存服务。
