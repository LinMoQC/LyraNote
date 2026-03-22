"""
Built-in Skill: web_search
Searches the internet via Tavily API and auto-saves results to the notebook.
Requires TAVILY_API_KEY environment variable.
"""

from __future__ import annotations

from uuid import UUID

from app.skills.base import SkillBase, SkillMeta


class WebSearchSkill(SkillBase):
    meta = SkillMeta(
        name="web-search",
        display_name="网络搜索",
        description=(
            "在互联网上搜索最新信息。"
            "当笔记本知识库中没有足够信息，或用户明确要求搜索网络、查找最新资讯时调用此工具。"
            "搜索结果会自动保存到笔记本知识库中供后续使用。"
        ),
        category="web",
        requires_env=["TAVILY_API_KEY"],
        thought_label="🌐 正在搜索网络",
        config_schema={
            "type": "object",
            "properties": {
                "max_results": {"type": "integer", "default": 5, "minimum": 1, "maximum": 10},
                "default_depth": {
                    "type": "string",
                    "enum": ["basic", "advanced"],
                    "default": "basic",
                },
            },
        },
    )

    def _build_schema(self, config: dict) -> dict:
        default_depth = config.get("default_depth", "basic")
        return {
            "name": "web_search",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索查询关键词，应简洁且语义明确",
                    },
                    "search_depth": {
                        "type": "string",
                        "enum": ["basic", "advanced"],
                        "description": f"搜索深度：basic=快速搜索（默认），advanced=深度搜索（更慢但结果更全面）。当前默认：{default_depth}",
                    },
                },
                "required": ["query"],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        from sqlalchemy import select
        from app.models import Source
        from app.providers import tavily

        query = args.get("query", "")
        search_depth = args.get("search_depth", "basic")

        results = await tavily.search(query, max_results=5, search_depth=search_depth)

        if not results:
            return "网络搜索未返回结果，请尝试更换关键词或检查 TAVILY_API_KEY 配置。"

        existing_result = await ctx.db.execute(
            select(Source.url).where(
                Source.notebook_id == UUID(ctx.notebook_id),
                Source.url.isnot(None),
            )
        )
        existing_urls: set[str] = set(existing_result.scalars().all())

        new_source_count = 0
        result_parts: list[str] = []

        for i, r in enumerate(results, 1):
            title = r.get("title") or "未知标题"
            url = r.get("url", "")
            content = r.get("content", "")
            score = float(r.get("score", 0.0))

            ctx.collected_citations.append(
                {
                    "source_id": f"web-search-{i}",
                    "chunk_id": f"web-search-chunk-{i}",
                    "excerpt": content[:200],
                    "source_title": title,
                    "score": score,
                }
            )

            ctx.ui_elements.append({
                "element_type": "web-card",
                "data": {
                    "title":   title,
                    "url":     url,
                    "snippet": content[:120],
                }
            })

            result_parts.append(
                f"[结果{i}] 《{title}》（相关度 {score:.0%}）\n"
                f"链接：{url}\n"
                f"{content[:500]}"
            )

            if url and url not in existing_urls:
                source = Source(
                    notebook_id=UUID(ctx.notebook_id),
                    title=title[:500],
                    type="web",
                    status="pending",
                    url=url,
                )
                ctx.db.add(source)
                await ctx.db.flush()
                await ctx.db.refresh(source)

                from app.workers.tasks import ingest_source
                ingest_source.delay(str(source.id))

                existing_urls.add(url)
                new_source_count += 1

        footer = f"\n\n---\n共搜索到 {len(results)} 条结果"
        if new_source_count > 0:
            footer += f"，其中 {new_source_count} 个新来源正在后台导入到知识库"

        return "\n\n".join(result_parts) + footer


skill = WebSearchSkill()
