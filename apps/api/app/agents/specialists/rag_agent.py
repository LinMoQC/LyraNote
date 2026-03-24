"""
RAGAgent — 知识库检索专家

负责从当前笔记本（或全局知识库）检索相关文档块，
并将结构化结果存入 MultiAgentState.specialist_result，
供 SynthesisNode 生成最终回答。
"""

from __future__ import annotations

import logging
from uuid import UUID

logger = logging.getLogger(__name__)


async def rag_agent_node(state: dict) -> dict:
    """
    LangGraph 节点：执行 RAG 检索。

    读取 state 中的 query / notebook_id / user_id / db 等字段，
    调用 retrieve_chunks() 获取相关文档块，返回更新后的 state 片段。
    """
    from app.agents.rag.retrieval import retrieve_chunks

    query: str = state["query"]
    notebook_id: str = state["notebook_id"]
    user_id: str = state["user_id"]
    db = state["db"]
    global_search: bool = state.get("global_search", False)
    history: list[dict] = state.get("messages", [])[-6:]

    try:
        chunks = await retrieve_chunks(
            query=query,
            notebook_id=notebook_id,
            db=db,
            global_search=global_search,
            user_id=UUID(user_id) if user_id else None,
            history=history,
        )
    except Exception:
        logger.warning("RAGAgent retrieval failed", exc_info=True)
        chunks = []

    return {
        "specialist_result": {
            "type": "rag",
            "chunks": chunks,
            "retrieved_count": len(chunks),
        }
    }
