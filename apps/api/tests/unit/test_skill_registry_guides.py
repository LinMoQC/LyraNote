from __future__ import annotations

from pathlib import Path

import pytest

from app.agents.memory import build_prompt_context_bundle
from app.agents.writing.composer import build_system_prompt
from app.skills.base import MarkdownSkill, SkillBase, SkillMeta
from app.skills.builtin.read_skill_guide import ReadSkillGuideSkill
from app.skills.registry import SkillRegistry


class _DummyToolSkill(SkillBase):
    meta = SkillMeta(
        name="dummy-tool",
        display_name="Dummy Tool",
        description="A dummy callable tool used for prompt tests.",
        category="productivity",
        when_to_use="Use this when a dummy callable tool is needed.",
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "dummy_tool",
            "description": self.meta.description,
            "parameters": {"type": "object", "properties": {}},
        }

    async def execute(self, args: dict, ctx) -> str:
        return "ok"


def _write_skill_file(tmp_path: Path, body: str = "## Playbook\nUse the special workflow.") -> Path:
    skill_dir = tmp_path / "guide-skill"
    skill_dir.mkdir()
    skill_file = skill_dir / "SKILL.md"
    skill_file.write_text(
        "---\n"
        "name: guide-skill\n"
        "display_name: Guide Skill\n"
        "description: A guide for special workflows.\n"
        "when_to_use: Use this guide when a workflow needs the special playbook.\n"
        "category: knowledge\n"
        "---\n\n"
        f"{body}\n",
        encoding="utf-8",
    )
    return skill_file


def test_markdown_skill_parses_when_to_use(tmp_path: Path) -> None:
    skill = MarkdownSkill.from_file(_write_skill_file(tmp_path))

    assert skill.meta.name == "guide-skill"
    assert skill.meta.when_to_use == "Use this guide when a workflow needs the special playbook."
    assert "Playbook" in skill.body


def test_registry_formats_guide_manifest_without_body(tmp_path: Path) -> None:
    registry = SkillRegistry()
    registry.register(_DummyToolSkill(), override=False)
    registry.register(MarkdownSkill.from_file(_write_skill_file(tmp_path)), override=False)

    manifest = registry.format_guide_skills_for_prompt(registry.all_skills())

    assert "<skill-guides>" in manifest
    assert 'name="guide-skill"' in manifest
    assert "<when_to_use>Use this guide when a workflow needs the special playbook.</when_to_use>" in manifest
    assert "Playbook" not in manifest
    assert "Use the special workflow." not in manifest


@pytest.mark.asyncio
async def test_read_skill_guide_returns_markdown_body(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    registry = SkillRegistry()
    registry.register(MarkdownSkill.from_file(_write_skill_file(tmp_path)), override=False)
    monkeypatch.setattr("app.skills.registry.skill_registry", registry)

    result = await ReadSkillGuideSkill().execute({"skill_name": "guide-skill"}, ctx=None)

    assert "# 技能指引：Guide Skill" in result
    assert "何时使用" in result
    assert "## Playbook" in result
    assert "Use the special workflow." in result


@pytest.mark.asyncio
async def test_build_system_prompt_uses_guide_manifest_instead_of_body(
    tmp_path: Path,
) -> None:
    tool_skill = _DummyToolSkill()
    guide_skill = MarkdownSkill.from_file(_write_skill_file(tmp_path))

    prompt = await build_system_prompt(
        build_prompt_context_bundle(scene="chat"),
        active_skills=[tool_skill, guide_skill],
    )

    # <skills> XML is intentionally NOT injected (tool schemas are passed via API parameter)
    assert "<skills>" not in prompt
    # <skill-guides> manifest IS injected (on-demand, lightweight — no body duplication)
    assert "<skill-guides>" in prompt
    assert "read_skill_guide" in prompt
    assert "Guide Skill" not in prompt  # display name is not part of the manifest
    assert "Use the special workflow." not in prompt
    assert "先调用 `read_skill_guide` 读取正文" in prompt
    assert "LyraNote 风格执行纪律" in prompt
    assert "简单问题直接回答" in prompt
    assert "不要把结构化 UI payload、原始 JSON 或工具内部格式直接暴露给用户" in prompt
    assert "## 额外指导" not in prompt


@pytest.mark.asyncio
async def test_build_system_prompt_groups_user_memories_by_kind(
) -> None:
    prompt = await build_system_prompt(
        build_prompt_context_bundle(
            scene="chat",
            user_memories=[
                {"key": "preferred_ai_name", "value": "Lyra", "confidence": 0.9, "memory_type": "preference", "memory_kind": "preference"},
                {"key": "writing_style", "value": "简洁", "confidence": 0.9, "memory_type": "preference", "memory_kind": "preference"},
                {"key": "professional_background", "value": "AI infra engineer", "confidence": 0.8, "memory_type": "fact", "memory_kind": "profile"},
                {"key": "current_research_topic", "value": "Agent runtime", "confidence": 0.8, "memory_type": "fact", "memory_kind": "project_state"},
                {"key": "project_docs_url", "value": "https://example.com/spec", "confidence": 0.8, "memory_type": "fact", "memory_kind": "reference"},
            ],
        ),
        active_skills=[],
    )

    assert "用户回答偏好与协作习惯" in prompt
    assert "用户长期背景画像" in prompt
    assert "用户当前阶段上下文" in prompt
    assert "用户常用参考入口" in prompt
    assert "writing_style: 简洁" in prompt
    assert "professional_background: AI infra engineer" in prompt
    assert "current_research_topic: Agent runtime" in prompt
    assert "project_docs_url: https://example.com/spec" in prompt
    assert "preferred_ai_name" not in prompt
