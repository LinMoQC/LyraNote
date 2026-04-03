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
    outputs = list(state.get("specialist_outputs") or [])
    prior_rag = next(
        (item for item in reversed(outputs) if item.get("specialist") == "rag"),
        None,
    )
    rag_count = int(prior_rag.get("retrieved_count", 0)) if prior_rag else 0
    global_search: bool = state.get("global_search", False)
    should_search_web = global_search or rag_count < 4

    await adispatch_custom_event("sse", {
        "type": "agent_trace",
        "event": "specialist_selected",
        "reason": "web_specialist",
        "detail": f"rag_count={rag_count};global_search={global_search}",
    })

    web_context: str | None = None
    search_results: list[dict] = []

    if not should_search_web:
        outputs.append(
            {
                "specialist": "web",
                "type": "web",
                "summary": "本地知识检索已足够，本轮跳过联网补充。",
                "web_context": "",
                "chunks": [],
            }
        )
        return {
            "specialist_result": {
                "type": "web",
                "web_context": None,
                "search_results": [],
                "chunks": [],
            },
            "specialist_outputs": outputs,
        }

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

    outputs.append(
        {
            "specialist": "web",
            "type": "web",
            "summary": "已补充互联网搜索结果。" if web_context else "联网补充未返回有效结果。",
            "web_context": web_context or "",
            "chunks": [],
        }
    )

    return {
        "specialist_result": {
            "type": "web",
            "web_context": web_context,
            "search_results": search_results,
            "chunks": [],  # web 场景无本地文档块
        },
        "specialist_outputs": outputs,
    }
