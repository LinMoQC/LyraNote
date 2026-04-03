"""
Built-in Skill: web_search

Multi-provider web search with deep content extraction and reranking.

Provider routing priority:
  Jina (no key, clean Markdown) → Perplexity (has key, synthesized answer) → Tavily (has key, default)

Steps performed:
  1. Route to best available provider based on config
  2. Optionally extract full content via Jina Reader for top-2 URLs (fetch_full_content=True)
  3. Rerank results with cross-encoder (reranker.py) when available
  4. Emit UI web-cards, save new URLs to notebook knowledge base
  5. Append quality signal at end to guide LLM self-reflection
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from app.skills.base import SkillBase, SkillMeta

logger = logging.getLogger(__name__)


class WebSearchSkill(SkillBase):
    meta = SkillMeta(
        name="web-search",
        display_name="网络搜索",
        description=(
            "在互联网上搜索最新信息。"
            "当笔记本知识库中没有足够信息，或用户明确要求搜索网络、查找最新资讯时调用此工具。"
        ),
        category="web",
        requires_env=[],  # Jina Search works without any key; Tavily/Perplexity optional
        thought_label="🌐 正在搜索网络",
        concurrency_safe=True,
        max_result_chars=8000,
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
                        "description": (
                            f"搜索深度：basic=快速搜索（默认），"
                            f"advanced=深度搜索（更慢但结果更全面）。当前默认：{default_depth}"
                        ),
                    },
                    "days": {
                        "type": "integer",
                        "description": "只返回最近 N 天内的结果（7=一周，30=一月）。时效性问题请设置此参数。",
                    },
                    "fetch_full_content": {
                        "type": "boolean",
                        "description": (
                            "为排名前 2 的结果提取完整网页内容（更慢但内容更丰富）。"
                            "适合深度研究或内容摘要任务，默认 false。"
                        ),
                    },
                },
                "required": ["query"],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        from app.config import settings
        from app.providers import jina, perplexity, tavily
        from app.providers.reranker import rerank
        from app.services.source_service import SourceService

        query: str = args.get("query", "")
        search_depth: str = args.get("search_depth", "basic")
        days: int | None = args.get("days")
        fetch_full_content: bool = bool(args.get("fetch_full_content", False))
        max_results: int = 5

        # -------------------------------------------------------
        # Step 2: Provider routing
        # -------------------------------------------------------
        results: list[dict] = []
        provider_used: str = ""

        if settings.perplexity_api_key:
            recency = _days_to_recency(days)
            results = await perplexity.search(
                query,
                max_results=max_results,
                recency_filter=recency,
            )
            provider_used = "perplexity"

        if not results and settings.tavily_api_key:
            results = await tavily.search(
                query,
                max_results=max_results,
                search_depth=search_depth,
                include_answer=True,
                days=days,
            )
            provider_used = "tavily"

        if not results:
            results = await jina.search(query, max_results=max_results)
            provider_used = "jina"

        if not results:
            return (
                "网络搜索未返回结果，请尝试更换关键词。\n\n"
                "[搜索质量评估] 0 条结果。建议修改 query 后重试。"
            )

        # -------------------------------------------------------
        # Step 3: Jina Reader — deep content extraction for top URLs
        # -------------------------------------------------------
        if fetch_full_content:
            top_urls = [r["url"] for r in results if r.get("url")][:2]
            if top_urls:
                full_texts = await asyncio.gather(
                    *[jina.read_url(u) for u in top_urls],
                    return_exceptions=True,
                )
                url_to_full: dict[str, str] = {}
                for u, text in zip(top_urls, full_texts):
                    if isinstance(text, str) and text.strip():
                        url_to_full[u] = text

                for r in results:
                    if r.get("url") in url_to_full:
                        r["content"] = url_to_full[r["url"]]

        # -------------------------------------------------------
        # Step 4: Reranking (graceful fallback — keeps original order on failure)
        # -------------------------------------------------------
        if len(results) > 1:
            docs = [r.get("content") or r.get("title") or "" for r in results]
            ranked_indices = await rerank(query, docs)
            results = [results[i] for i in ranked_indices]

        # -------------------------------------------------------
        # Step 5: Build output + quality signal
        # -------------------------------------------------------
        import_candidates: list[dict] = []
        new_source_count = 0
        result_parts: list[str] = []
        top_score: float = 0.0

        for i, r in enumerate(results, 1):
            title: str = r.get("title") or "未知标题"
            url: str = r.get("url") or ""
            content: str = r.get("content") or ""
            score: float = float(r.get("score") or 0.0)
            top_score = max(top_score, score)

            ctx.collected_citations.append({
                "source_id": f"web-search-{i}",
                "chunk_id": f"web-search-chunk-{i}",
                "excerpt": content[:400],
                "source_title": title,
                "score": score,
            })

            if url:
                ctx.ui_elements.append({
                    "element_type": "web-card",
                    "data": {
                        "title": title,
                        "url": url,
                        "snippet": content[:120],
                    },
                })

            result_parts.append(
                f"[结果{i}] 《{title}》（相关度 {score:.0%}）\n"
                f"链接：{url}\n"
                f"{content[:1200]}"
            )

            if url:
                import_candidates.append({"title": title, "url": url})

        if import_candidates and ctx.persist_web_sources:
            save_candidates = [
                c for c, r in zip(import_candidates, results)
                if float(r.get("score") or 0.0) >= 0.4
            ][:3]
            if save_candidates:
                source_service = SourceService(ctx.db, ctx.user_id)
                import_result = await source_service.import_web_sources(
                    save_candidates,
                    notebook_id=UUID(ctx.notebook_id) if ctx.notebook_id else None,
                )
                new_source_count = import_result.created_count

        footer = f"\n\n---\n共搜索到 {len(results)} 条结果"
        if new_source_count > 0:
            footer += f"，其中 {new_source_count} 个新来源已保存到知识库"

        # Quality signal for LLM self-reflection (Step 5)
        quality_hint = (
            f"\n\n[搜索质量评估] 找到 {len(results)} 条结果，"
            f"最高相关度 {top_score:.0%}（来源：{provider_used}）。\n"
        )
        if top_score < 0.4:
            quality_hint += (
                "当前结果相关度较低，建议换用不同关键词重新搜索，"
                "或启用 fetch_full_content=true 获取完整内容。"
            )
        elif not fetch_full_content:
            quality_hint += (
                "如需更深入的内容（完整文章/论文），"
                "可在下一次调用时设置 fetch_full_content=true。"
            )

        return "\n\n".join(result_parts) + footer + quality_hint


def _days_to_recency(days: int | None) -> str:
    """Convert a days integer to a Perplexity recency_filter string."""
    if days is None:
        return "month"
    if days <= 1:
        return "day"
    if days <= 7:
        return "week"
    if days <= 30:
        return "month"
    return "year"


skill = WebSearchSkill()
