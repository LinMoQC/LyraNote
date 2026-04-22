# Exec Plan: Desktop Release Automation and Auto Update

**状态**: 已完成  
**创建时间**: 2026-04-23  
**完成时间**: 2026-04-23  
**负责人**: Agent  

---

## 目标

推送 `vX.Y.Z` tag 后，自动生成 macOS Apple Silicon 与 Intel 桌面安装包，上传到 GitHub Release，并让已安装的 LyraNote Desktop 可以在应用内检测、下载、安装更新。

---

## 背景 & 上下文

- 相关设计文档：无
- 相关 API 端点：无后端 API 变更
- 影响范围：Desktop 前端、Tauri Rust、GitHub Actions、发布文档
- 当前 `release.yml` 只创建 GitHub Release 并发布 CLI；桌面端没有自动打包或 Tauri updater 配置。

---

## 任务分解

### Tauri / Desktop
- [x] 接入 `tauri-plugin-updater` 与 `tauri-plugin-process`
- [x] 配置 updater public key、GitHub `latest.json` endpoint 和 updater artifacts
- [x] 新增桌面更新服务接口：检查更新、下载安装、重启应用
- [x] 在设置页增加桌面更新入口与状态反馈

### GitHub Actions
- [x] 重构 release workflow 为 draft-first 发布流程
- [x] 增加 macOS Apple Silicon 与 Intel 桌面包构建矩阵
- [x] 发布前同步 Desktop package、Tauri config、Cargo 版本
- [x] 上传安装包、updater artifact、签名文件和 `latest.json`

### 文档
- [x] 更新 `apps/desktop/README.md`，记录本地打包、tag 发布、GitHub Secrets 和更新方式

### 测试
- [x] 编写桌面更新服务单元测试
- [x] 编写设置页更新 UI 回归测试
- [x] 跑 Desktop typecheck/test 与 Tauri Rust test

---

## 测试策略

**单元测试覆盖**：
- `checkForDesktopUpdate`：非 Tauri 环境、无更新、有更新、失败
- `downloadAndInstallDesktopUpdate`：进度事件、完成、失败
- 设置页更新入口：不可用状态、发现更新、下载安装、安装后重启提示
- `build_desktop_sidecar.py`：仓库根目录与输出路径解析

**集成/构建验证**：
- `cd apps/api && python3 scripts/build_desktop_sidecar.py`
- `cd apps/desktop && pnpm tauri build`

**测试文件位置**：
- `apps/api/tests/unit/test_build_desktop_sidecar.py`
- `apps/desktop/tests/unit/services/desktop-update-service.test.ts`
- `apps/desktop/tests/unit/pages/settings-page-updates.test.tsx`

---

## 验收标准（全部满足才算完成）

- [x] `vX.Y.Z` tag 能触发 draft Release、构建 macOS arm64/x64 桌面包并上传 Release assets
- [x] Release assets 包含安装包、updater artifact、`.sig` 和 `latest.json`
- [x] 已安装桌面端能从 GitHub Releases `latest.json` 检测更新
- [x] 设置页能显示当前版本、可用版本、下载进度、安装完成和错误状态
- [x] `cd apps/desktop && pnpm typecheck && pnpm test` 全绿
- [x] `cd apps/desktop/src-tauri && cargo test` 全绿
- [x] 发布文档包含 GitHub Secrets 和不包含 notarization 的说明

---

## 决策日志

- 2026-04-23: 首版只做 macOS 自动打包与自动更新，Windows/Linux 后续单独规划。
- 2026-04-23: 使用 Tauri updater 签名，不在本轮接入 Apple Developer ID notarization。
- 2026-04-23: 使用 GitHub Releases `latest.json` 作为静态更新源，不引入独立更新服务器。
- 2026-04-23: 修复 sidecar 构建脚本仓库根目录解析，并把 PyInstaller 配置缓存固定到项目 `tmp` 下，避免本地沙箱和 CI 写用户级缓存目录。
- 2026-04-23: 生成的 updater 私钥保存到 `~/.tauri/lyranote-updater.key`，公钥写入 `tauri.conf.json`。
