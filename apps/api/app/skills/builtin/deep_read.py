"""
Built-in Skill: deep_read_sources
Performs deep reading analysis on notebook sources — argument strength, assumptions, contradictions.
"""

from __future__ import annotations

from app.skills.base import SkillBase, SkillMeta


class DeepReadSkill(SkillBase):
    meta = SkillMeta(
        name="deep-read-sources",
        display_name="深度阅读",
        description=(
            "对笔记本中的来源进行逐段深度分析，评估论证强度、"
            "标注隐含假设、识别来源间的矛盾与互证。"
            "当用户要求深度阅读、批判性分析或学术审阅时调用。"
        ),
        category="knowledge",
        thought_label="📖 正在深度阅读",
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "deep_read_sources",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "focus": {
                        "type": "string",
                        "description": "分析重点，如'论证逻辑'、'数据可靠性'、'方法论'。留空则全面分析。",
                    }
                },
                "required": [],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        from app.agents.rag.retrieval import retrieve_chunks
        from app.providers.llm import chat

        focus = args.get("focus", "")
        chunks = await retrieve_chunks(
            "核心论点 关键论据 研究方法 数据结论",
            ctx.notebook_id, ctx.db, top_k=12,
            global_search=ctx.global_search, user_id=ctx.user_id,
        )
        if not chunks:
            return "笔记本中暂无可用内容，请先添加来源。"

        context = "\n\n".join(
            f"【来源{i+1}: {c.get('source_title', '未知')}】\n{c['text']}"
            for i, c in enumerate(chunks)
        )
        focus_instruction = f"请重点关注：{focus}" if focus else ""
        prompt = (
            f"请对以下资料进行深度阅读分析。{focus_instruction}\n"
            "对每段核心内容：\n"
            "1. 提炼核心论点\n"
            "2. 评估论证强度（强/中/弱）并说明理由\n"
            "3. 识别隐含假设\n"
            "4. 标注来源间的互相印证或矛盾\n"
            "5. 给出综合评价与建议\n\n"
            f"资料：\n{context}"
        )
        return await chat(
            [
                {"role": "system", "content": "你是一位学术分析专家，擅长批判性阅读与论证分析。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )


skill = DeepReadSkill()
