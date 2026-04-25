# Exec Plan: Desktop Icon Sync And Local Uninstall

**状态**: 已完成
**创建时间**: 2026-04-23
**完成时间**: 2026-04-23
**负责人**: Agent

---

## 目标

删除本机已安装的 `LyraNote.app`，并把桌面端打包图标替换为 web 端当前使用的图标资源。

---

## 背景 & 上下文

- 相关设计文档：`docs/exec-plans/completed/desktop-release-autoupdate.md`
- 相关 API 端点：无
- 影响范围：桌面端打包资源 / 本地安装产物

当前本机存在 `/Applications/LyraNote.app`。桌面端 Tauri 图标仍是旧的黄蓝圆环，而 web 端当前在用的是 `apps/web/src/app/icon.png` 里的里拉琴图标，需要统一品牌表现。

---

## 任务分解

### 本地环境
- [x] 定位并删除本机已安装的 `/Applications/LyraNote.app`

### 桌面端
- [x] 确认 web 端图标源文件
- [x] 使用 web 端图标重生成 `apps/desktop/src-tauri/icons/` 下的 Tauri 图标资源
- [x] 验证 `tauri.conf.json` 仍引用更新后的图标文件
- [x] 重新打包桌面应用，确认新图标可用于后续安装

### 测试
- [x] 验证本机安装产物已删除
- [x] 验证生成后的桌面端 icon 文件存在
- [x] 运行 `pnpm typecheck`
- [x] 运行 `pnpm tauri build`

---

## 测试策略

**手动/构建验证覆盖**：
- `rm -rf /Applications/LyraNote.app` 后确认路径不存在
- `pnpm tauri icon ../web/src/app/icon.png --output src-tauri/icons`
- `pnpm typecheck`
- `pnpm tauri build`

**测试文件位置**：
- 纯资源与本地安装清理，本次不新增单元测试

---

## 验收标准（全部满足才算完成）

- [x] `/Applications/LyraNote.app` 已删除
- [x] 桌面端 `src-tauri/icons/` 已更新为 web 图标生成结果
- [x] `cd apps/desktop && pnpm typecheck` 全绿
- [x] `cd apps/desktop && pnpm tauri build` 成功

---

## 决策日志

- 2026-04-23: 直接复用 `apps/web/src/app/icon.png` 作为桌面端唯一图标源，避免 web/desktop 品牌资源继续漂移。
