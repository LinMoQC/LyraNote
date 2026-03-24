"""
LangGraph 多 Agent 图组装

将 Lyra 主 Agent（Orchestrator）和五个专家 Agent 组装成一个
可编译的 LangGraph StateGraph，在进程启动时编译为全局实例。

图结构：
  START → orchestrator → [条件路由] → {rag|research|writing|memory|web}
                                              ↓
                                        synthesis → END
"""

from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph

from app.agents.orchestrator import MultiAgentState, orchestrator_node, synthesis_node
from app.agents.specialists.memory_agent import memory_agent_node
from app.agents.specialists.rag_agent import rag_agent_node
from app.agents.specialists.research_agent import research_agent_node
from app.agents.specialists.web_agent import web_agent_node
from app.agents.specialists.writing_agent import writing_agent_node

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 路由选择器
# ---------------------------------------------------------------------------

_VALID_ROUTES = {"rag", "research", "writing", "memory", "web"}


def _route_selector(state: MultiAgentState) -> str:
    route = state.get("route", "rag")
    if route not in _VALID_ROUTES:
        logger.warning("Unknown route '%s', falling back to rag", route)
        return "rag"
    return route


# ---------------------------------------------------------------------------
# 图构建与编译
# ---------------------------------------------------------------------------

def build_multi_agent_graph():
    """构建并编译多 Agent LangGraph 图。"""
    graph = StateGraph(MultiAgentState)

    # Lyra 主 Agent 节点
    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("synthesis", synthesis_node)

    # 专家节点
    specialists = [
        ("rag", rag_agent_node),
        ("research", research_agent_node),
        ("writing", writing_agent_node),
        ("memory", memory_agent_node),
        ("web", web_agent_node),
    ]
    for name, fn in specialists:
        graph.add_node(name, fn)
        graph.add_edge(name, "synthesis")

    # 图入口
    graph.add_edge(START, "orchestrator")

    # Orchestrator 条件路由
    graph.add_conditional_edges(
        "orchestrator",
        _route_selector,
        {name: name for name, _ in specialists},
    )

    # 终止
    graph.add_edge("synthesis", END)

    return graph.compile()


# 全局单例 — 在模块导入时编译（约 50ms，只编译一次）
try:
    MULTI_AGENT_GRAPH = build_multi_agent_graph()
    logger.info("Multi-agent graph compiled successfully")
except Exception:
    logger.exception("Failed to compile multi-agent graph")
    MULTI_AGENT_GRAPH = None  # type: ignore[assignment]
