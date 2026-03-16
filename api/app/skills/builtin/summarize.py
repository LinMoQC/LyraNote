"""
Built-in Skill: summarize_sources
Generates structured artifacts (summary, FAQ, study guide, briefing) from notebook sources.
"""

from __future__ import annotations

from app.skills.base import SkillBase, SkillMeta


class SummarizeSkill(SkillBase):
    meta = SkillMeta(
        name="summarize-sources",
        display_name="生成摘要",
        description=(
            "基于笔记本中的来源内容，生成摘要、FAQ、学习指南或简报。"
            "当用户要求生成结构化输出时调用。"
        ),
        category="knowledge",
        thought_label="📝 正在生成摘要",
        config_schema={
            "type": "object",
            "properties": {
                "max_chunks": {"type": "integer", "default": 8, "minimum": 3, "maximum": 20},
            },
        },
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "summarize_sources",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "artifact_type": {
                        "type": "string",
                        "enum": ["summary", "faq", "study_guide", "briefing", "outline"],
                        "description": "生成类型：summary=摘要, faq=常见问答, study_guide=学习指南, briefing=简报, outline=结构化大纲",
                    }
                },
                "required": ["artifact_type"],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        from app.agents.retrieval import retrieve_chunks
        from app.agents.composer import generate_artifact, ArtifactType

        artifact_type: ArtifactType = args.get("artifact_type", "summary")

        chunks = await retrieve_chunks(
            "主要内容 核心观点 研究结论", ctx.notebook_id, ctx.db, top_k=8,
            global_search=ctx.global_search, user_id=ctx.user_id,
        )
        if not chunks:
            return "笔记本中暂无可用内容，请先添加来源。"

        return await generate_artifact(artifact_type, chunks)


skill = SummarizeSkill()
