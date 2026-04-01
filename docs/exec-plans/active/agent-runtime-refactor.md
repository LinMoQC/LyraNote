# Exec Plan: Agent Runtime Refactor

**状态**: 进行中  
**创建时间**: 2026-04-01  
**完成时间**: —  
**负责人**: Agent  

---

## 目标

先为 LyraNote Agent Runtime 落地第一阶段基础设施：将 `SKILL.md` 从默认全量注入改成 manifest 常驻、正文按需读取，为后续 ReAct / routing / multi-agent 重构清理上下文面。

---

## 背景 & 上下文

- 相关设计文档：`docs/design-docs/skills-system.md`
- 相关设计文档：`docs/design-docs/memory-system-v2.md`
- 影响范围：后端

---

## 任务分解

### 后端
- [ ] 扩展 `app/skills/base.py` 的技能元数据，支持 `when_to_use`
- [ ] 扩展 `app/skills/registry.py`，区分 tool manifest 与 guide manifest
- [ ] 新增按需读取 Markdown skill 正文的内置工具
- [ ] 调整 `app/agents/writing/composer.py`，移除默认全量注入的 `SKILL.md` 正文

### 前端
- [ ] 暂不改动 UI，仅保持兼容

### 测试
- [ ] 编写后端单元测试：`apps/api/tests/unit/test_skill_registry_guides.py`
- [ ] 扩充 prompt 相关测试，确保默认 prompt 不再包含 Markdown skill 正文
- [ ] 跑测试全绿：`pytest apps/api/tests/unit/test_skill_registry_guides.py -v`

---

## 测试策略

**单元测试覆盖**：
- `MarkdownSkill.from_file()`：解析 `when_to_use`
- `SkillRegistry.format_guide_skills_for_prompt()`：输出 guide manifest，不泄露正文
- `ReadSkillGuideSkill.execute()`：能按技能名返回对应 `SKILL.md` 正文
- `build_system_prompt()`：默认只包含 guide manifest，不包含 Markdown skill 正文

**测试文件位置**：
- `apps/api/tests/unit/test_skill_registry_guides.py`
- `apps/api/tests/unit/test_compose_answer_extra_graph.py`

---

## 验收标准（全部满足才算完成）

- [ ] Agent 默认 system prompt 不再全量注入 Markdown skill 正文
- [ ] LLM 可通过内置工具按需读取指定 guide
- [ ] `pytest apps/api/tests/unit/test_skill_registry_guides.py -v` 全绿
- [ ] 相关已有单元测试无回归

---

## 决策日志

- 2026-04-01: 第一阶段优先落 skills 渐进披露，而不是同时推进 verification / multi-agent，原因是它改动面更集中、能立刻降低 prompt 污染，并为后续 agent runtime 重构提供稳定基础。
