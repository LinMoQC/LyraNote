# Exec Plan: Desktop Runtime Import Deadlock Fix

**状态**: 已完成  
**创建时间**: 2026-04-21  
**完成时间**: 2026-04-21  
**负责人**: Agent  

---

## 目标

修复 `desktop_runtime_service` 在模块导入阶段初始化 `DesktopStateStore` 时的死锁，恢复 API 正常启动，并补上不会让测试套件卡死的回归测试。

---

## 背景 & 上下文

- 相关设计文档：`docs/ARCHITECTURE.md`
- 相关 API 端点：`GET /api/v1/desktop/runtime`
- 影响范围：后端

---

## 任务分解

### 后端
- [x] 修复 `apps/api/app/services/desktop_runtime_service.py` 中 `DesktopStateStore` 初始化时的锁重入死锁
- [x] 保持桌面状态库初始化行为与现有调用方兼容
- [x] 确认 API 导入与启动路径不再被桌面运行时初始化阻塞

### 前端
- [x] 无需改动

### 测试
- [x] 编写后端单元测试：`apps/api/tests/unit/test_desktop_runtime_service.py`
- [x] 不需要新增后端集成测试（本次为导入期死锁回归）
- [x] 无需前端测试
- [x] 跑相关测试并确认通过

---

## 测试策略

**单元测试覆盖**：
- `DesktopStateStore.__init__`：在临时目录初始化时不会发生死锁
- `DesktopStateStore._init_db`：初始化后会正确落盘必要的 SQLite 表

**集成测试覆盖**：
- 本次不新增；通过手动导入/启动验证 API 不再卡在模块导入阶段

**测试文件位置**：
- `apps/api/tests/unit/test_desktop_runtime_service.py`

---

## 验收标准（全部满足才算完成）

- [x] API 不再因导入 `app.services.desktop_runtime_service` 卡死
- [x] `pytest apps/api/tests/unit/test_desktop_runtime_service.py -v` 全绿
- [x] 相关桌面服务既有单测保持通过
- [x] 本次修改无新增架构违规

---

## 决策日志

- 2026-04-21: 采用“去掉初始化期递归连接路径”的修复方式，而不是仅把 `Lock` 替换成 `RLock`；这样能直接消除重入根因，并让后续初始化路径更清晰。
- 2026-04-21: 保留 `desktop_state_dir_override` 的动态切换能力，让现有桌面服务测试与运行时目录切换场景继续成立。
