"""
RAGAgent — 知识库检索专家

负责从当前笔记本（或全局知识库）检索相关文档块，
并将结构化结果存入 MultiAgentState.specialist_result，
供 SynthesisNode 生成最终回答。
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

logger = logging.getLogger(__name__)


async def rag_agent_node(state: dict) -> dict:
    """
    LangGraph 节点：执行 RAG 检索。

    读取 state 中的 query / notebook_id / user_id / db 等字段，
    先生成查询变体（用于展示改写结果），再调用 retrieve_chunks() 获取相关文档块。
    """
    from app.agents.rag.retrieval import _generate_query_variants, retrieve_chunks
    from langchain_core.callbacks.manager import adispatch_custom_event

    query: str = state["query"]
    notebook_id: str = state["notebook_id"]
    user_id: str = state["user_id"]
    db = state["db"]
    global_search: bool = state.get("global_search", False)
    history: list[dict] = state.get("messages", [])[-6:]
    outputs = list(state.get("specialist_outputs") or [])

    await adispatch_custom_event("sse", {
        "type": "agent_trace",
        "event": "specialist_selected",
        "reason": "rag_specialist",
        "detail": query[:80],
    })

    # 先生成查询变体，这样 tool_call 事件能展示改写后的主查询
    try:
        variants = await asyncio.wait_for(
            _generate_query_variants(query, history), timeout=4.0
        )
    except Exception:
        variants = [query]

    primary = variants[0]

    await adispatch_custom_event("sse", {
        "type": "tool_call",
        "tool": "rag_search",
        "input": {
            "query": primary,
            "variants": variants[1:],
            "global_search": global_search,
        },
    })

    try:
        chunks = await retrieve_chunks(
            query=query,
            notebook_id=notebook_id,
            db=db,
            global_search=global_search,
            user_id=UUID(user_id) if user_id else None,
            history=history,
            _precomputed_variants=variants,
        )
    except Exception:
        logger.warning("RAGAgent retrieval failed", exc_info=True)
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

    result = {
        "specialist": "rag",
        "type": "rag",
        "summary": f"知识库检索命中 {len(chunks)} 条片段。",
        "chunks": chunks[:10],
        "retrieved_count": len(chunks),
    }
    outputs.append(result)

    return {
        "specialist_result": {
            "type": "rag",
            "chunks": chunks,
            "retrieved_count": len(chunks),
        },
        "specialist_outputs": outputs,
    }
