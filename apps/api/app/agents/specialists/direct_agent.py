"""
DirectAgent — 主 Agent 直接回答占位节点

当 orchestrator 决定可直接回答时（无需知识库检索），
此节点仅返回空 specialist_result，synthesis_node 将使用
对话历史和用户画像直接生成回答，不触发任何检索。
"""

from __future__ import annotations


async def direct_agent_node(state: dict) -> dict:
    return {
        "specialist_result": {
            "type": "direct",
            "chunks": [],
        }
    }
