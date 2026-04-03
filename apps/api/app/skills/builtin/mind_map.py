"""
Built-in Skill: generate_mind_map
Generates an interactive mind map visualization from notebook knowledge.
"""

from __future__ import annotations

import json
import re

from app.skills.base import SkillBase, SkillMeta


class MindMapSkill(SkillBase):
    meta = SkillMeta(
        name="generate-mind-map",
        display_name="生成思维导图",
        description=(
            "基于当前笔记本的知识库内容，生成一份交互式可视化思维导图，直接渲染在对话界面中供用户查看。"
            "调用此工具后，思维导图会立即以图形卡片形式展示给用户，无需在回答中重复输出文字版导图。"
            "当用户要求梳理知识结构、生成思维导图、或整理核心概念关系时调用。"
        ),
        category="knowledge",
        interrupt_behavior="block",
        thought_label="🗺️ 正在生成思维导图",
        config_schema={
            "type": "object",
            "properties": {
                "default_depth": {"type": "string", "enum": ["2", "3"], "default": "2"},
            },
        },
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "generate_mind_map",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "思维导图的主题，若未指定则使用笔记本整体主题",
                    },
                    "depth": {
                        "type": "string",
                        "description": "思维导图层级深度，2=两层，3=三层（默认2）",
                        "enum": ["2", "3"],
                    },
                },
                "required": [],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        from app.agents.rag.retrieval import retrieve_chunks
        from app.providers.llm import chat

        topic = args.get("topic", "")
        depth = int(args.get("depth", 2))

        query = topic if topic else "核心概念 主要主题 关键知识点"
        chunks = await retrieve_chunks(
            query, ctx.notebook_id, ctx.db, top_k=8,
            global_search=ctx.global_search, user_id=ctx.user_id,
        )

        if not chunks:
            return "知识库中暂无内容，请先添加来源后再生成思维导图。"

        context = "\n\n".join(
            f"[来源{i}] 《{c['source_title']}》\n{c['content'][:400]}"
            for i, c in enumerate(chunks, 1)
        )
        depth_instruction = (
            "每个分支下再细分 2-4 个子节点（共3层）" if depth == 3
            else "每个分支下列出 2-4 个叶节点（共2层）"
        )

        prompt = f"""基于以下参考资料，为主题"{topic or '知识库核心内容'}"生成一份思维导图结构。

要求：
- 根节点：1个，代表核心主题
- 一级分支：4-6个，代表主要方面/类别
- {depth_instruction}
- 节点标签简洁（4-12字），不要用序号

严格按以下 JSON 格式输出，不要有任何额外文字：
{{
  "title": "根节点标题",
  "branches": [
    {{
      "label": "分支1",
      "children": [
        {{"label": "叶节点1"}},
        {{"label": "叶节点2"}}
      ]
    }}
  ]
}}

参考资料：
{context}"""

        raw = await chat([{"role": "user", "content": prompt}], temperature=0.3)

        json_match = re.search(r'\{[\s\S]*\}', raw)
        if not json_match:
            return "思维导图生成失败，请重试。"

        try:
            mind_map = json.loads(json_match.group())
            ctx.mind_map_data = mind_map
            branch_count = len(mind_map.get("branches", []))
            return (
                f"思维导图已生成并以可视化卡片形式展示给用户。"
                f"主题：《{mind_map.get('title', topic)}》，包含 {branch_count} 个主要分支。"
                f"请勿在回答中重复输出文字版思维导图，只需简短告知用户导图已展示即可。"
            )
        except json.JSONDecodeError:
            return "思维导图数据解析失败，请重试。"


skill = MindMapSkill()
