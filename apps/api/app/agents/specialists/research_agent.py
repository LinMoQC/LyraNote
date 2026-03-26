"""
ResearchAgent — 快速研究专家

当用户的问题需要综合多步分析、跨资料对比或较深度探讨时使用。
流程：RAG 检索 + （可选）Web 搜索 → 合并上下文 → 供 Synthesis 深度回答。
与「深度研究」（DeepResearch）不同，这里是单次多跳而非多轮任务。
"""

from __future__ import annotations

import logging
from uuid import UUID

logger = logging.getLogger(__name__)


async def research_agent_node(state: dict) -> dict:
    """
    LangGraph 节点：执行快速研究（RAG + 可选 Web 搜索）。
    """
    from app.agents.rag.retrieval import retrieve_chunks
    from langchain_core.callbacks.manager import adispatch_custom_event

    query: str = state["query"]
    notebook_id: str = state["notebook_id"]
    user_id: str = state["user_id"]
    db = state["db"]
    global_search: bool = state.get("global_search", False)
    history: list[dict] = state.get("messages", [])[-6:]

    # ── 1. RAG 检索（本地知识优先）────────────────────────────────────────────
    await adispatch_custom_event("sse", {
        "type": "tool_call",
        "tool": "rag_search",
        "input": {"query": query, "global_search": True, "top_k": 12},
    })
    try:
        chunks = await retrieve_chunks(
            query=query,
            notebook_id=notebook_id,
            db=db,
            global_search=True,  # 研究场景默认全局搜索
            user_id=UUID(user_id) if user_id else None,
            history=history,
            top_k=12,  # 研究场景拿更多 chunk
        )
    except Exception:
        logger.warning("ResearchAgent RAG retrieval failed", exc_info=True)
        chunks = []

    await adispatch_custom_event("sse", {
        "type": "tool_result",
        "content": (
            f"检索到 {len(chunks)} 条相关片段"
            + (
                "\n" + "\n".join(
                    f"· {c.get('source_title', '未知来源')}"
                    for c in chunks[:5]
                )
                if chunks else ""
            )
        ),
    })

    # ── 2. Web 搜索补充（可选，仅当本地结果不足时）──────────────────────────────
    web_context: str | None = None
    if len(chunks) < 4:
        await adispatch_custom_event("sse", {
            "type": "tool_call",
            "tool": "web_search",
            "input": {"query": query, "max_results": 5},
        })
        try:
            from app.skills.builtin.web_search import skill as web_search_skill
            from app.agents.core.tools import ToolContext

            ctx = ToolContext(
                notebook_id=notebook_id,
                user_id=UUID(user_id) if user_id else None,
                db=db,
                global_search=global_search,
                history=history,
            )
            web_context = await web_search_skill.execute({"query": query, "max_results": 5}, ctx)
            await adispatch_custom_event("sse", {
                "type": "tool_result",
                "content": "互联网搜索完成",
            })
        except Exception:
            logger.debug("ResearchAgent web search failed (non-fatal)", exc_info=True)

    return {
        "specialist_result": {
            "type": "research",
            "chunks": chunks,
            "web_context": web_context,
            "research_depth": "deep",  # 告知 synthesis 使用深度分析风格
        }
    }
