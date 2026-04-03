"""
Built-in Skill: read_skill_guide

Allows the agent to read a Markdown SKILL.md guide on demand instead of
loading every guide body into the system prompt by default.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.skills.base import SkillBase, SkillMeta

if TYPE_CHECKING:
    from app.agents.core.tools import ToolContext


class ReadSkillGuideSkill(SkillBase):
    meta = SkillMeta(
        name="read-skill-guide",
        display_name="读取技能指引",
        description=(
            "按需读取某个 Markdown 技能指引的正文。"
            "当你判断某个 skill guide 与当前任务明确相关，需要查看其详细操作规范时使用。"
            "不要一次性读取全部 guide。"
        ),
        category="productivity",
        concurrency_safe=True,
        max_result_chars=4000,
        when_to_use="当某个 skill guide 与当前任务明确相关，需要查看详细正文后再决定如何调用工具时使用。",
        always=True,
        thought_label="📘 读取技能指引…",
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "read_skill_guide",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "要读取的技能名称，例如 lyranote-memory",
                    }
                },
                "required": ["skill_name"],
            },
        }

    async def execute(self, args: dict, ctx: "ToolContext") -> str:
        from app.skills.registry import skill_registry

        skill_name = str(args.get("skill_name", "")).strip()
        if not skill_name:
            return "skill_name 不能为空。"

        guide = skill_registry.get_markdown_skill(skill_name)
        if guide is None:
            return f"未找到名为 {skill_name} 的技能指引。"

        header = [
            f"# 技能指引：{guide.meta.display_name}",
            f"- 标识符：{guide.meta.name}",
        ]
        if guide.meta.when_to_use:
            header.append(f"- 何时使用：{guide.meta.when_to_use}")

        body = guide.body.strip()
        if not body:
            return "\n".join(header + ["", "该技能当前没有可读取的正文。"])

        return "\n".join(header + ["", body])


skill = ReadSkillGuideSkill()
