# Exec Plan: Desktop Rust Runtime

**状态**: 进行中  
**创建时间**: 2026-04-17  
**完成时间**: —  
**负责人**: Agent  

---

## 目标

将 `apps/desktop` 从“手填 server URL 的 Tauri 壳”升级为“自动启动本地 sidecar 的桌面平台层”，首轮重点交付 runtime supervisor、会话安全存储、桌面 bridge 和诊断入口。

---

## 背景 & 上下文

- 相关设计文档：`docs/ARCHITECTURE.md`
- 相关 API 端点：`GET /health`、`POST /api/v1/auth/login`、`GET /api/v1/auth/me`
- 新增 API 端点：`GET /api/v1/desktop/runtime`、`GET /api/v1/jobs`、`POST /api/v1/jobs/{id}/cancel`、`GET/POST/DELETE /api/v1/watch-folders`
- 影响范围：前端 + 后端 + Tauri Rust

---

## 任务分解

### Rust / Tauri
- [ ] 新增 runtime supervisor，自动拉起本地 Python sidecar
- [ ] 新增 runtime 状态命令与事件广播
- [ ] 新增 macOS Keychain 会话存取命令
- [ ] 新增文件选择 / Reveal / 通知命令

### 前端
- [ ] 新增 `desktopBridge` 与 runtime store
- [ ] 移除 `baseUrl` 启动门槛，改为 runtime 启动门槛
- [ ] 登录与登出改为走安全会话存储
- [ ] 增加 runtime 启动页和 diagnostics 视图
- [ ] 设置页新增桌面运行时信息与操作入口

### 后端
- [ ] 新增 desktop domain/router/service
- [ ] 新增 desktop runtime / jobs / watch-folders 基础接口
- [ ] FastAPI startup 支持 stdout runtime 事件
- [ ] 为 desktop profile 补充最小配置与兼容逻辑

### 测试
- [ ] Rust 单元测试：状态解析、stdout 事件解析
- [ ] Python 单元测试：desktop service / watch-folder registry
- [ ] 前端构建与测试：desktop 启动与 runtime diagnostics

---

## 测试策略

**单元测试覆盖**：
- runtime 状态映射与 stdout 事件解析
- desktop watch-folder 注册/去重/删除
- auth session hydrate / migrate helper

**集成测试覆盖**：
- `GET /api/v1/desktop/runtime`
- `GET /api/v1/watch-folders`
- `POST /api/v1/watch-folders`
- `DELETE /api/v1/watch-folders`

**测试文件位置**：
- `apps/desktop/src-tauri/src/runtime.rs` 内联测试
- `apps/api/tests/unit/test_desktop_service.py`
- `apps/desktop/tests/unit/lib/auth-session.test.ts`

---

## 验收标准（全部满足才算完成）

- [ ] 桌面端启动时自动探测并启动本地 sidecar
- [ ] 不再要求用户先填写 server URL 才能进入登录页
- [ ] 登录凭证不再持久化到浏览器 localStorage
- [ ] runtime 启动失败时显示 diagnostics，而不是卡死在 setup 页
- [ ] `cargo test`、`pytest`、`pnpm build` 至少覆盖本轮新增能力

---

## 决策日志

- 2026-04-17: 首轮先落 runtime supervisor 和安全会话，不在同一轮强推 SQLite / 本地 job queue。
- 2026-04-17: 不新增 Rust 第三方依赖，优先使用系统命令（`security` / `open` / `osascript`）降低落地风险。
