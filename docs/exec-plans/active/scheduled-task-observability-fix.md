# Exec Plan: 定时任务可观测性修复

**状态**: 进行中  
**创建时间**: 2026-03-27  
**完成时间**: —  
**负责人**: Agent

---

## 目标

修复 LyraNote 定时任务“没有自动触发 / 没有稳定文件日志”的问题，让 Celery Beat 在本地与 Docker 部署中都能正常运行，并让后台任务的关键 `INFO` 日志可落盘用于排障与监控。

---

## 背景 & 上下文

- 相关设计文档：`docs/design-docs/scheduled-tasks.md`
- 相关后端模块：`apps/api/app/workers/celery_app.py`、`apps/api/app/workers/tasks/scheduler.py`
- 相关启动入口：`packages/cli/src/commands/local.js`、`docker-compose.yml`、`docker-compose.prod.yml`
- 影响范围：后端 / 运维启动链路

---

## 任务分解

### 后端
- [ ] 调整 `apps/api/app/logging_config.py`，为后台任务增加独立的 `INFO` 文件日志落点
- [ ] 保持现有通用告警日志策略不变，避免主日志文件被普通 `INFO` 淹没

### 启动链路
- [ ] 修改 `packages/cli/src/commands/local.js`，本地开发时新增 `celery beat` 进程
- [ ] 修改 `docker-compose.yml`，新增 `beat` 服务
- [ ] 修改 `docker-compose.prod.yml`，新增 `beat` 服务

### 测试
- [ ] 编写后端单元测试：验证后台任务 `INFO` 日志会写入专用日志文件，非任务 `INFO` 不会混入
- [ ] 跑测试全绿：`pytest tests/unit/test_logging_config.py -v`

---

## 测试策略

**单元测试覆盖**：
- `setup_logging`：验证会创建后台任务专用日志文件
- `setup_logging`：验证 `app.workers.tasks.*` 的 `INFO` 日志会落盘
- `setup_logging`：验证普通应用 `INFO` 日志不会进入后台任务日志文件

**手动验证覆盖**：
- 本地运行 `./lyra local` 时可看到单独的 Beat 进程
- Docker Compose 启动后可看到 `beat` 服务
- 触发定时任务后，`apps/api/logs/scheduled-tasks-YYYY-MM-DD.log` 出现执行记录

**测试文件位置**：
- `apps/api/tests/unit/test_logging_config.py`

---

## 验收标准（全部满足才算完成）

- [ ] 本地开发模式会启动 `celery beat`
- [ ] Docker 开发 / 生产编排中包含独立 `beat` 服务
- [ ] 定时任务关键 `INFO` 日志可落到专用文件
- [ ] `pytest tests/unit/test_logging_config.py -v` 全绿
- [ ] `ruff check apps/api/app/logging_config.py apps/api/tests/unit/test_logging_config.py` 无报错

---

## 决策日志

- 2026-03-27: 采用“新增独立后台任务日志文件”而不是直接把全局文件日志降到 `INFO`，以避免 API 与第三方库常规日志淹没定时任务排障信号。
- 2026-03-27: 采用独立 `beat` 进程，而不是 `worker -B`，以保持开发与生产拓扑一致并降低调度器单点耦合。
