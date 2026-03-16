"""
Skill: update_memory_doc
Allows the AI to update the global evergreen memory document.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.skills.base import SkillBase, SkillMeta

if TYPE_CHECKING:
    from app.agents.tools import ToolContext


class UpdateMemoryDocSkill(SkillBase):
    meta = SkillMeta(
        name="update_memory_doc",
        display_name="更新 AI 记忆",
        description=(
            "将用户的重要个人信息、长期偏好、背景知识写入全局记忆文档。"
            "当用户明确告知个人信息（如职业、研究方向、重要偏好）或对话中出现应长期记住的关键事实时使用。"
            "不要用于记录临时信息或对话摘要。"
        ),
        category="memory",
        always=True,
        thought_label="💾 更新记忆…",
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "update_memory_doc",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "content_md": {
                        "type": "string",
                        "description": (
                            "完整的全局记忆文档内容（Markdown 格式）。"
                            "这是覆盖写入，请先读取已有内容，在其基础上追加或修改后再写入。"
                        ),
                    },
                },
                "required": ["content_md"],
            },
        }

    async def execute(self, args: dict, ctx: "ToolContext") -> str:
        import asyncio
        from app.agents.file_memory import write_memory_doc, sync_memory_doc_to_db

        content_md: str = args.get("content_md", "").strip()
        if not content_md:
            return "记忆内容不能为空。"

        await asyncio.to_thread(write_memory_doc, content_md)

        # Always sync MEMORY.md back to DB so the content is available via
        # build_memory_context() in future conversations (regardless of memory_mode).
        try:
            synced = await sync_memory_doc_to_db(ctx.user_id, ctx.db, force=True)
            if synced:
                await ctx.db.flush()
        except Exception:
            pass  # File write succeeded; DB sync failure is non-fatal

        return "已成功更新全局记忆文档。"


skill = UpdateMemoryDocSkill()
