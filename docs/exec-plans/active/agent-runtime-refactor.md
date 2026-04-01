# Exec Plan: Agent Runtime Refactor

**状态**: 进行中  
**创建时间**: 2026-04-01  
**完成时间**: —  
**负责人**: Agent  

---

## 目标

为 LyraNote Agent Runtime 落地第一阶段基础设施：先完成 `SKILL.md` 渐进披露、轻量 verification、single/multi-agent 路由收敛，再补上 memory taxonomy，为后续 multi-agent / scene-aware runtime 重构清理上下文面。

---

## 背景 & 上下文

- 相关设计文档：`docs/design-docs/skills-system.md`
- 相关设计文档：`docs/design-docs/memory-system-v2.md`
- 影响范围：后端

---

## 任务分解

### 后端
- [x] 扩展 `app/skills/base.py` 的技能元数据，支持 `when_to_use`
- [x] 扩展 `app/skills/registry.py`，区分 tool manifest 与 guide manifest
- [x] 新增按需读取 Markdown skill 正文的内置工具
- [x] 调整 `app/agents/writing/composer.py`，移除默认全量注入的 `SKILL.md` 正文
- [x] 在 `app/agents/core/{instructions,brain,engine,state}.py` 增加轻量 verification 路径
- [x] 在 `app/agents/core/react_agent.py` 增加 single-agent / multi-agent 路由判定
- [x] 为 `user_memories` 增加 `memory_kind`，区分 `profile / preference / project_state / reference`
- [x] 调整 `app/agents/memory/{extraction,retrieval}.py`，让记忆抽取与召回使用 taxonomy
- [x] 兼容 `/memory` 返回结构，在不打断现有 `memory_type` 分组的前提下暴露 `memory_kind`

### 前端
- [ ] 暂不改动 UI，仅保持兼容

### 测试
- [x] 编写后端单元测试：`apps/api/tests/unit/test_skill_registry_guides.py`
- [x] 扩充 prompt 相关测试，确保默认 prompt 不再包含 Markdown skill 正文
- [x] 跑测试全绿：`pytest apps/api/tests/unit/test_skill_registry_guides.py -v`
- [x] 跑纯状态机回归：`pytest apps/api/tests/test_agents_brain.py -v`
- [x] 编写路由回归测试：`apps/api/tests/unit/test_react_agent_routing.py`
- [x] 编写 memory taxonomy 单元测试：`apps/api/tests/unit/test_memory_taxonomy.py`

---

## 测试策略

**单元测试覆盖**：
- `MarkdownSkill.from_file()`：解析 `when_to_use`
- `SkillRegistry.format_guide_skills_for_prompt()`：输出 guide manifest，不泄露正文
- `ReadSkillGuideSkill.execute()`：能按技能名返回对应 `SKILL.md` 正文
- `build_system_prompt()`：默认只包含 guide manifest，不包含 Markdown skill 正文
- `classify_agent_execution_route()`：附件 / tool hint / 可视化 / 深研究的路由判定
- `infer_memory_kind()` / `_upsert_memory()`：记忆类型路由与默认 TTL
- `build_memory_context()`：召回结果返回 `memory_kind`

**测试文件位置**：
- `apps/api/tests/unit/test_skill_registry_guides.py`
- `apps/api/tests/unit/test_compose_answer_extra_graph.py`
- `apps/api/tests/unit/test_react_agent_routing.py`
- `apps/api/tests/unit/test_memory_taxonomy.py`

---

## 验收标准（全部满足才算完成）

- [ ] Agent 默认 system prompt 不再全量注入 Markdown skill 正文
- [ ] LLM 可通过内置工具按需读取指定 guide
- [ ] `pytest apps/api/tests/unit/test_skill_registry_guides.py -v` 全绿
- [ ] 相关已有单元测试无回归
- [ ] 记忆抽取与召回支持 `memory_kind`
- [ ] single-agent / multi-agent 路由判定可单测验证

---

## 决策日志

- 2026-04-01: 第一阶段优先落 skills 渐进披露，而不是同时推进 verification / multi-agent，原因是它改动面更集中、能立刻降低 prompt 污染，并为后续 agent runtime 重构提供稳定基础。
- 2026-04-01: memory taxonomy 先以 `memory_kind` 叠加到现有 `memory_type` 之上，优先升级 runtime 召回质量，不在同一轮打破前端 `/memory` 既有分组结构。
