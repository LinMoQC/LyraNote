# Exec Plan: Desktop Release v1.0.1 Publish

**状态**: 进行中  
**创建时间**: 2026-04-23  
**完成时间**: —  
**负责人**: Agent

---

## 目标

发布 LyraNote Desktop 的 `v1.0.1` GitHub Release，并修复当前 release workflow 对 `NPM_TOKEN` 的硬依赖，避免 CLI npm 发布缺失 secret 时阻断桌面安装包发布。

---

## 背景 & 上下文

- 相关工作流：`.github/workflows/release.yml`
- 相关文档：`apps/desktop/README.md`
- 当前阻塞：
  - 已配置 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  - 未配置 `NPM_TOKEN`
  - 现有 release workflow 会把 `publish-cli` 作为 `publish-release` 的前置依赖，导致桌面 release 被 npm 发布阻断
- 版本选择：
  - 仓库已存在 `v1.0.0`
  - 为保证 GitHub Release 与桌面 updater 的版本递增安全，本次发布选择 `v1.0.1`

---

## 任务分解

### GitHub Actions / Release
- [ ] 调整 `release.yml`，让 CLI npm 发布变为可选
- [ ] 保持桌面 macOS release 资产上传与正式发布流程不受影响

### 文档
- [ ] 更新 `apps/desktop/README.md` 中对 `NPM_TOKEN` 的说明
- [ ] 增加 `CHANGELOG.md` 的 `v1.0.1` 发布记录

### 发布执行
- [ ] 提交并推送 release-prep 改动
- [ ] 创建并推送 `v1.0.1` tag
- [ ] 观察 GitHub Release workflow 至成功完成

---

## 测试策略

**配置验证**：
- 检查 release workflow 语义：桌面发布 job 不再依赖 CLI publish 成功
- 检查 GitHub secrets：确认 updater signing key 已存在

**发布验证**：
- 推送 tag 后确认 Release workflow 创建 draft release 并进入桌面构建
- 确认 workflow 成功后，GitHub Release 包含 macOS 产物与 updater artifacts

**测试文件位置**：
- `.github/workflows/release.yml`
- `apps/desktop/README.md`
- `CHANGELOG.md`

---

## 验收标准（全部满足才算完成）

- [ ] `v1.0.1` tag 成功触发 Release workflow
- [ ] GitHub Release 成功发布，不再被缺失 `NPM_TOKEN` 阻断
- [ ] Release 包含桌面安装包和 updater 相关产物
- [ ] 文档与 workflow 行为一致

---

## 决策日志

- 2026-04-23: 选择 `v1.0.1` 而不是 `v0.4.0`，因为仓库中已存在 `v1.0.0`，继续沿用 `1.x` 版本线更安全。
- 2026-04-23: 将 CLI npm 发布改为可选，避免桌面 release 被与本次目标无关的 npm secret 缺失阻断。
