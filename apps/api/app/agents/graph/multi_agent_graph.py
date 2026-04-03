"""
LangGraph 深度研究图（多 Agent，仅用于深度研究场景）

图结构：
  START → orchestrator → rag_research → web_research → synthesis → END
                       ↓
                     direct ───────────────────────→ synthesis → END

普通 Q&A / RAG / 联网 / 闲聊 均由单 Agent ReAct 循环处理，不经过此图。
"""

from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph

from .orchestrator import MultiAgentState, orchestrator_node, synthesis_node
from app.agents.specialists.direct_agent import direct_agent_node
from app.agents.specialists.rag_agent import rag_agent_node
from app.agents.specialists.web_agent import web_agent_node

logger = logging.getLogger(__name__)

_VALID_ROUTES = {"research", "direct"}


def _route_selector(state: MultiAgentState) -> str:
    route = state.get("route", "research")
    if route not in _VALID_ROUTES:
        logger.warning("Unknown route '%s', falling back to research", route)
        return "research"
    return route


def build_multi_agent_graph():
    """构建并编译深度研究多 Agent 图。"""
    graph = StateGraph(MultiAgentState)

    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("synthesis", synthesis_node)
    graph.add_node("rag_research", rag_agent_node)
    graph.add_node("web_research", web_agent_node)
    graph.add_node("direct", direct_agent_node)

    graph.add_edge(START, "orchestrator")
    graph.add_conditional_edges(
        "orchestrator",
        _route_selector,
        {"research": "rag_research", "direct": "direct"},
    )
    graph.add_edge("rag_research", "web_research")
    graph.add_edge("web_research", "synthesis")
    graph.add_edge("direct", "synthesis")
    graph.add_edge("synthesis", END)

    return graph.compile()


try:
    MULTI_AGENT_GRAPH = build_multi_agent_graph()
    logger.info("Multi-agent graph (deep research) compiled successfully")
except Exception:
    logger.exception("Failed to compile multi-agent graph")
    MULTI_AGENT_GRAPH = None  # type: ignore[assignment]
