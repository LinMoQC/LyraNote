"""
Built-in Skill: search_notebook_knowledge
Retrieves relevant chunks from the notebook knowledge base via embedding similarity.
always=True — core capability, cannot be disabled.
"""

from __future__ import annotations

import asyncio

from app.skills.base import SkillBase, SkillMeta


class SearchKnowledgeSkill(SkillBase):
    meta = SkillMeta(
        name="search-notebook-knowledge",
        display_name="知识库检索",
        description=(
            "在知识库中检索与问题最相关的内容片段。"
            "在笔记本内对话时检索该笔记本的知识；在全局对话时跨所有笔记本检索。"
            "当需要查找具体资料、研究内容或事实性信息时调用此工具。"
        ),
        category="knowledge",
        always=True,
        thought_label="🔍 正在检索知识库",
        config_schema={
            "type": "object",
            "properties": {
                "top_k": {"type": "integer", "default": 5, "minimum": 1, "maximum": 20},
                "min_score": {"type": "number", "default": 0.3, "minimum": 0.0, "maximum": 1.0},
            },
        },
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "search_notebook_knowledge",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索查询，使用与用户问题相关的关键词",
                    }
                },
                "required": ["query"],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        from app.agents.rag.graph_retrieval import graph_augmented_context
        from app.agents.rag.retrieval import retrieve_chunks

        query = args.get("query", "")
        chunks, graph_ctx = await asyncio.gather(
            retrieve_chunks(
                query, ctx.notebook_id, ctx.db,
                global_search=ctx.global_search,
                user_id=ctx.user_id,
                history=getattr(ctx, "history", None),
            ),
            graph_augmented_context(query, ctx.notebook_id, ctx.db),
            return_exceptions=True,
        )

        if isinstance(chunks, Exception):
            chunks = []
        if isinstance(graph_ctx, Exception):
            graph_ctx = ""

        if not chunks and not graph_ctx:
            return "未找到相关内容。"

        ctx.collected_citations.extend(
            {
                "source_id": c["source_id"],
                "chunk_id": c["chunk_id"],
                "excerpt": c["excerpt"],
                "source_title": c["source_title"],
                "score": c.get("score"),
            }
            for c in chunks
            if not any(x["chunk_id"] == c["chunk_id"] for x in ctx.collected_citations)
        )

        result_parts = []

        # Prepend graph context so the LLM sees structural knowledge first.
        if graph_ctx:
            result_parts.append(graph_ctx)

        for i, c in enumerate(chunks, 1):
            meta = c.get("metadata_") or {}
            page_info = f"第 {meta['page']} 页" if meta.get("page") else ""
            heading_info = meta.get("heading") or meta.get("section") or ""
            location = "、".join(filter(None, [page_info, heading_info]))
            source_label = f"《{c['source_title']}》" + (f"（{location}）" if location else "")
            result_parts.append(
                f"[片段{i}] 来源：{source_label}（相关度 {c['score']:.2f}）\n{c['content'][:400]}"
            )
        return "\n\n".join(result_parts)


skill = SearchKnowledgeSkill()
