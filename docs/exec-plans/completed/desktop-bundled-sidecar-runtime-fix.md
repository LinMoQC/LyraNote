# Exec Plan: Desktop Bundled Sidecar Runtime Fix

**状态**: 已完成
**创建时间**: 2026-04-23
**完成时间**: 2026-04-23
**负责人**: Agent

---

## 目标

修复 macOS 打包版桌面应用启动 bundled sidecar 后反复退出、健康检查一直卡在 starting 的问题。

---

## 背景 & 上下文

- 相关设计文档：`docs/exec-plans/completed/desktop-release-autoupdate.md`
- 相关 API 端点：`GET /health`
- 影响范围：桌面端打包脚本 / Tauri bundle 配置 / sidecar 构建测试 / 桌面 runtime 启动配置

当前 `build_desktop_sidecar.py` 使用 PyInstaller `--onefile` 生成单文件 sidecar，并通过 Tauri `externalBin` 打入 `Contents/MacOS`。打包后直接运行该 sidecar 会在本地环境中触发 PyInstaller bootloader 同步信号量初始化失败，桌面 runtime supervisor 只能看到进程退出，导致启动界面反复重启。

后续排查还发现 desktop runtime 没有设置本地 SQLite 默认 `DATABASE_URL`，会继续尝试连接 PostgreSQL；同时 `/health` 对 Redis 过于严格，导致无 Redis 的桌面模式无法返回 200。

---

## 任务分解

### 后端 / 打包脚本
- [x] 将 `apps/api/scripts/build_desktop_sidecar.py` 从 PyInstaller onefile 改为 onedir runtime 输出。
- [x] 生成 target-triple 命名的 wrapper 作为 Tauri `externalBin`。
- [x] wrapper 同时支持 app bundle 内 `Contents/Resources` 路径和本地 `binaries/` 目录路径。
- [x] 桌面 runtime 默认使用 `DESKTOP_STATE_DIR_OVERRIDE` 下的本地 SQLite、storage、memory 路径。
- [x] 桌面 runtime 启动时创建 SQLite schema，并跳过 server-only 的 Redis/Celery startup 路径。

### 桌面端
- [x] 在 `tauri.conf.json` 中把 onedir runtime 作为 `bundle.resources` 打入 app。
- [x] 更新 `apps/desktop/src-tauri/binaries/README.md` 说明新的 wrapper/runtime 结构。
- [x] 更新 `.gitignore` 忽略生成的 runtime 目录。

### 测试
- [x] 扩展 `apps/api/tests/unit/test_build_desktop_sidecar.py`，覆盖路径常量、Python 版本、wrapper 内容、PyInstaller hidden imports。
- [x] 新增 `apps/api/tests/unit/test_desktop_main.py`，覆盖桌面 runtime 本地环境默认值。
- [x] 重新构建 sidecar 并验证源码 `binaries/` wrapper 能启动 health endpoint。
- [x] 重新运行 Tauri 打包，确认 bundle 内包含 wrapper、runtime、updater artifact。
- [x] 验证最终 `.app` 内 wrapper 能启动 health endpoint。

---

## 测试策略

**单元测试覆盖**：
- `write_wrapper`：生成可执行 wrapper，并包含 bundle/local runtime fallback。
- `sidecar_paths`：输出 wrapper 路径和 runtime 目录遵循 Tauri 约定。
- `configure_desktop_environment`：桌面模式默认落到本地 SQLite / storage / memory。
- `pyinstaller_command`：包含 `app` 动态导入和 `aiosqlite` hidden import。

**集成/手动验证覆盖**：
- `.venv/bin/python scripts/build_desktop_sidecar.py`：生成 onedir runtime 和 wrapper。
- 直接运行生成的 wrapper，验证 `GET /health` 返回可用。
- `pnpm tauri build`：确认 macOS bundle、DMG、updater tarball 和签名仍能生成。
- 直接运行 `LyraNote.app/Contents/MacOS/lyranote-api-desktop`，验证 app bundle 内资源路径可用。

**测试文件位置**：
- `apps/api/tests/unit/test_build_desktop_sidecar.py`
- `apps/api/tests/unit/test_desktop_main.py`

---

## 验收标准（全部满足才算完成）

- [x] 打包版 sidecar 不再依赖 PyInstaller onefile bootloader。
- [x] App bundle 内存在 `Contents/MacOS/lyranote-api-desktop` wrapper。
- [x] App bundle 内存在 `Contents/Resources/lyranote-api-desktop-runtime/lyranote-api-desktop`。
- [x] wrapper 本地健康检查通过。
- [x] `cd apps/api && .venv/bin/pytest tests/unit/test_build_desktop_sidecar.py -v` 全绿。
- [x] `cd apps/desktop && pnpm typecheck` 全绿。
- [x] `cd apps/desktop/src-tauri && cargo test` 全绿。
- [x] `cd apps/desktop && pnpm tauri build` 成功。

---

## 决策日志

- 2026-04-23: 选择 PyInstaller onedir + Tauri resources + externalBin wrapper，而不是继续 onefile；这样避免 onefile bootloader 的运行时同步信号量/解包问题，也让资源路径和调试更可控。
- 2026-04-23: 桌面 runtime 默认改为本地 SQLite，并在 `/health` 中跳过 Redis；桌面包不应依赖外部 PostgreSQL/Redis 才能进入 ready。
