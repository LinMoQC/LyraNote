"""
DirectAgent — 主 Agent 直接回答占位节点

当 orchestrator 决定可直接回答时（无需知识库检索），
此节点仅返回空 specialist_result，synthesis_node 将使用
对话历史和用户画像直接生成回答，不触发任何检索。
"""

from __future__ import annotations


async def direct_agent_node(state: dict) -> dict:
    from langchain_core.callbacks.manager import adispatch_custom_event

    await adispatch_custom_event("sse", {
        "type": "agent_trace",
        "event": "specialist_selected",
        "reason": "direct_specialist",
        "detail": "direct",
    })
    outputs = list(state.get("specialist_outputs") or [])
    outputs.append(
        {
            "specialist": "direct",
            "type": "direct",
            "summary": "无需额外检索，直接进入回答合成。",
            "chunks": [],
        }
    )
    return {
        "specialist_result": {
            "type": "direct",
            "chunks": [],
        },
        "specialist_outputs": outputs,
    }
