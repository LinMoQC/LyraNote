# Exec Plan: Provider Review Fixes

**状态**: 已完成  
**创建时间**: 2026-03-31  
**完成时间**: 2026-03-31  
**负责人**: Agent  

---

## 目标

修复 review 中指出的两个 provider 风险：Anthropic thinking 参数不兼容导致请求失败，以及图片生成下载链路存在 SSRF / 大文件读取风险。

---

## 背景 & 上下文

- 相关 review comments：
  - `apps/api/app/providers/anthropic_provider.py`
  - `apps/api/app/providers/image_gen_provider.py`
- 影响范围：后端 provider 层

---

## 任务分解

### 后端
- [x] 调整 Anthropic streaming 参数构造，thinking 模式下移除 `temperature`
- [x] 为 thinking 预算添加合法范围约束，确保 `< max_tokens` 且满足最小值
- [x] 为图片下载增加 URL 校验、私网阻断与大小限制
- [x] 保持 provider 接口不变，避免上层调用方改动

### 测试
- [x] 更新 Anthropic provider 单测，覆盖 thinking 参数分支
- [x] 新增 image_gen_provider 单测，覆盖 URL 校验与大小限制
- [x] 跑定向 pytest

---

## 测试策略

**单元测试覆盖**：
- `AnthropicProvider.chat_stream()`：thinking 打开时的 kwargs 构造
- `generate_image()`：合法 URL 下载、非法 scheme/host 拒绝、超大 body 拒绝

**测试文件位置**：
- `apps/api/tests/test_providers_anthropic.py`
- `apps/api/tests/test_providers_image_gen.py`

---

## 验收标准

- [x] thinking 模式下不会再同时发送 `temperature`
- [x] thinking 预算不会违反 Anthropic API 约束
- [x] 第三方图片 URL 会做校验并限制下载体积
- [x] 定向 pytest 全绿
