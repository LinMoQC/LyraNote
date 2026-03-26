"""
WritingAgent — 内容生成专家

负责生成结构化内容（摘要、FAQ、大纲、学习指南等）。
流程：RAG 检索 → 注入写作提示词模板 → 供 Synthesis 按格式输出。
"""

from __future__ import annotations

import logging
from uuid import UUID

logger = logging.getLogger(__name__)

# 写作场景提示词
_WRITING_HINTS = {
    "summary": "请生成一份简洁清晰的摘要（300-500字），涵盖核心主题和关键结论。",
    "faq": "请生成 5-8 个常见问题与解答（Q:/A: 格式），每题聚焦一个核心知识点。",
    "outline": "请生成一份层次清晰的大纲，适合转化为文章或演讲稿。",
    "briefing": "请生成一份简短的情况汇报，突出背景、关键发现和行动建议。",
}


async def writing_agent_node(state: dict) -> dict:
    """
    LangGraph 节点：执行结构化内容生成。
    """
    from app.agents.rag.retrieval import retrieve_chunks
    from langchain_core.callbacks.manager import adispatch_custom_event

    query: str = state["query"]
    notebook_id: str = state["notebook_id"]
    user_id: str = state["user_id"]
    db = state["db"]
    history: list[dict] = state.get("messages", [])[-6:]

    # 从 query 中推断写作格式
    writing_format = _detect_writing_format(query)
    format_hint = _WRITING_HINTS.get(writing_format, "")

    await adispatch_custom_event("sse", {
        "type": "tool_call",
        "tool": "rag_search",
        "input": {"query": query, "top_k": 15, "format": writing_format},
    })

    # RAG 检索参考资料
    try:
        chunks = await retrieve_chunks(
            query=query,
            notebook_id=notebook_id,
            db=db,
            user_id=UUID(user_id) if user_id else None,
            history=history,
            top_k=15,  # 写作需要更多上下文
        )
    except Exception:
        logger.warning("WritingAgent retrieval failed", exc_info=True)
        chunks = []

    await adispatch_custom_event("sse", {
        "type": "tool_result",
        "content": (
            f"检索到 {len(chunks)} 条相关片段，生成格式：{writing_format}"
            + (
                "\n" + "\n".join(
                    f"· {c.get('source_title', '未知来源')}"
                    for c in chunks[:5]
                )
                if chunks else ""
            )
        ),
    })

    return {
        "specialist_result": {
            "type": "writing",
            "chunks": chunks,
            "writing_format": writing_format,
            "format_hint": format_hint,
        }
    }


def _detect_writing_format(query: str) -> str:
    """从 query 关键词推断写作格式。"""
    q = query.lower()
    if any(kw in q for kw in ["摘要", "总结", "summary", "概括"]):
        return "summary"
    if any(kw in q for kw in ["faq", "问答", "常见问题", "qa"]):
        return "faq"
    if any(kw in q for kw in ["大纲", "outline", "结构", "框架"]):
        return "outline"
    if any(kw in q for kw in ["汇报", "briefing", "报告", "report"]):
        return "briefing"
    return "summary"
