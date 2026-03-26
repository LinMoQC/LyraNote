"""
WebAgent — 互联网搜索专家

当用户需要最新的互联网信息（新闻、文档、价格等）时使用。
调用 WebSearchSkill 获取搜索结果，供 SynthesisNode 整合回答。
"""

from __future__ import annotations

import logging
from uuid import UUID

logger = logging.getLogger(__name__)


async def web_agent_node(state: dict) -> dict:
    """
    LangGraph 节点：执行 Web 搜索。
    """
    from app.skills.builtin.web_search import skill as web_search_skill
    from app.agents.core.tools import ToolContext
    from langchain_core.callbacks.manager import adispatch_custom_event

    query: str = state["query"]
    notebook_id: str = state["notebook_id"]
    user_id: str = state["user_id"]
    db = state["db"]

    web_context: str | None = None
    search_results: list[dict] = []

    await adispatch_custom_event("sse", {
        "type": "tool_call",
        "tool": "web_search",
        "input": {"query": query, "max_results": 8},
    })

    try:
        ctx = ToolContext(
            notebook_id=notebook_id,
            user_id=UUID(user_id) if user_id else None,
            db=db,
            global_search=False,
            history=[],
        )
        raw = await web_search_skill.execute(
            {"query": query, "max_results": 8},
            ctx,
        )
        web_context = raw if isinstance(raw, str) else str(raw)
        await adispatch_custom_event("sse", {
            "type": "tool_result",
            "content": "互联网搜索完成",
        })
    except Exception:
        logger.warning("WebAgent search failed", exc_info=True)
        web_context = None

    return {
        "specialist_result": {
            "type": "web",
            "web_context": web_context,
            "search_results": search_results,
            "chunks": [],  # web 场景无本地文档块
        }
    }
