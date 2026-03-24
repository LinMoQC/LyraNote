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
        from app.agents.rag.retrieval import retrieve_chunks
        from app.agents.writing.composer import generate_artifact, ArtifactType

        artifact_type: ArtifactType = args.get("artifact_type", "summary")

        # Use a bilingual query for better cross-lingual retrieval coverage
        chunks = await retrieve_chunks(
            "main content key findings research conclusions overview 主要内容 核心观点 研究结论",
            ctx.notebook_id, ctx.db, top_k=8,
            global_search=ctx.global_search, user_id=ctx.user_id,
        )

        # Fallback: if similarity search returns empty (e.g. threshold too strict or
        # embedding API temporarily unavailable), fetch chunks directly from DB so
        # that summarization always works when indexed content exists.
        if not chunks:
            chunks = await self._fetch_chunks_direct(ctx)

        if not chunks:
            return "笔记本中暂无可用内容，请先添加来源。"

        return await generate_artifact(artifact_type, chunks)

    @staticmethod
    async def _fetch_chunks_direct(ctx) -> list[dict]:
        """Direct DB fetch without similarity filter — used as a fallback."""
        from uuid import UUID
        from sqlalchemy import func, select
        from app.models import Chunk, Source

        try:
            result = await ctx.db.execute(
                select(
                    Chunk.id,
                    Chunk.content,
                    Chunk.source_id,
                    Chunk.source_type,
                    Chunk.metadata_,
                    Source.title.label("source_title"),
                )
                .outerjoin(Source, Chunk.source_id == Source.id)
                .where(
                    Chunk.notebook_id == UUID(ctx.notebook_id),
                    (Source.status == "indexed") | (Chunk.source_type == "note"),
                )
                .order_by(func.random())
                .limit(10)
            )
            rows = result.all()
            return [
                {
                    "chunk_id": str(r.id),
                    "source_id": str(r.source_id) if r.source_id else "",
                    "source_title": r.source_title or (
                        "📝 笔记" if r.source_type == "note" else "未知来源"
                    ),
                    "excerpt": r.content[:300],
                    "content": r.content,
                    "score": 0.5,
                    "metadata_": r.metadata_,
                }
                for r in rows
                if r.content
            ]
        except Exception:
            return []


skill = SummarizeSkill()
