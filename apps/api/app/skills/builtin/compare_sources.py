"""
Built-in Skill: compare_sources
Structurally compares multiple notebook sources — consensus, divergence, unique contributions.
"""

from __future__ import annotations

from app.skills.base import SkillBase, SkillMeta


class CompareSourcesSkill(SkillBase):
    meta = SkillMeta(
        name="compare-sources",
        display_name="对比来源",
        description=(
            "对比笔记本中多个来源的观点异同，生成结构化对比分析。"
            "当用户要求对比、比较不同来源或文献时调用。"
        ),
        category="knowledge",
        concurrency_safe=True,
        max_result_chars=8000,
        thought_label="⚖️ 正在对比来源",
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "compare_sources",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "对比维度或主题，如'技术方案'、'研究结论'、'方法论'。留空则全面对比。",
                    }
                },
                "required": [],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        from app.agents.rag.retrieval import retrieve_chunks
        from app.providers.llm import chat

        topic = args.get("topic", "")
        chunks = await retrieve_chunks(
            topic or "核心观点 主要结论 技术方案",
            ctx.notebook_id, ctx.db, top_k=15,
            global_search=ctx.global_search, user_id=ctx.user_id,
        )
        if not chunks:
            return "笔记本中暂无可用内容，请先添加来源。"

        sources: dict[str, list[str]] = {}
        for c in chunks:
            title = c.get("source_title", "未知来源")
            sources.setdefault(title, []).append(c["text"])

        if len(sources) < 2:
            return "当前笔记本中只有一个来源，无法进行对比分析。请添加更多来源后重试。"

        context = "\n\n".join(
            f"=== 来源：{title} ===\n" + "\n".join(texts)
            for title, texts in sources.items()
        )
        topic_instruction = f"请围绕「{topic}」进行对比。" if topic else ""
        prompt = (
            f"请对以下 {len(sources)} 个来源进行结构化对比分析。{topic_instruction}\n"
            "输出格式：\n"
            "1. **共识点**：各来源一致的观点\n"
            "2. **分歧点**：各来源不同或矛盾的地方\n"
            "3. **独有贡献**：每个来源独特的视角或信息\n"
            "4. **综合判断**：基于对比的总结建议\n\n"
            f"资料：\n{context}"
        )
        return await chat(
            [
                {"role": "system", "content": "你是一位擅长比较分析的研究助手，善于发现不同来源间的异同。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )


skill = CompareSourcesSkill()
