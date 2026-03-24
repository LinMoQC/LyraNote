"""
Lyra 主 Agent / Orchestrator

核心职责：
  1. 加载用户画像 + 场景识别
  2. 一次 LLM function-calling 决定路由（temperature=0，约 100ms）
  3. 下发子任务给专家 Agent
  4. 接收专家结果，流式输出最终回答（synthesis_node）

MultiAgentState 是贯穿整个图的共享状态，通过 TypedDict 定义。
"""

from __future__ import annotations

import json
import logging
from typing import Any, TypedDict

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 共享状态
# ---------------------------------------------------------------------------

class MultiAgentState(TypedDict, total=False):
    # ── 输入 ────────────────────────────────────────────────────────────────
    query: str                          # 当前用户消息
    messages: list[dict]                # 对话历史（含当前 query）
    user_memories: list[dict] | None    # L2/L3 记忆碎片
    user_portrait: dict | None          # L4 用户画像（由 orchestrator 预加载）
    notebook_summary: dict | None       # 笔记本摘要
    scene_instruction: str | None       # 场景识别结果

    # ── 运行时传递（不可序列化，不适合持久化） ──────────────────────────────
    notebook_id: str
    user_id: str
    db: Any                             # AsyncSession（运行时注入）
    global_search: bool
    tool_hint: str | None

    # ── 路由结果 ────────────────────────────────────────────────────────────
    route: str                          # orchestrator_node 填写

    # ── 专家输出 ────────────────────────────────────────────────────────────
    specialist_result: dict | None      # 专家 Agent 的结构化输出


# ---------------------------------------------------------------------------
# 路由决策 schema（function-calling）
# ---------------------------------------------------------------------------

_ROUTE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "route_to_specialist",
            "description": "将用户请求路由到最合适的专家 Agent",
            "parameters": {
                "type": "object",
                "properties": {
                    "route": {
                        "type": "string",
                        "enum": ["rag", "research", "writing", "memory", "web"],
                        "description": (
                            "rag=本地知识库问答（默认）, "
                            "research=需要多步骤深度分析或跨文档对比, "
                            "writing=生成摘要/大纲/FAQ等结构化内容, "
                            "memory=用户明确要求记住某事或更新偏好, "
                            "web=需要互联网实时信息"
                        ),
                    },
                    "reasoning": {
                        "type": "string",
                        "description": "路由原因（内部日志）",
                    },
                },
                "required": ["route"],
            },
        },
    }
]

_ROUTE_SYSTEM = """你是 Lyra，一个智能路由器。
根据用户的问题，决定将请求路由到哪个专家：
- rag：大多数知识库问答，默认选择
- research：需要跨文档深度对比分析
- writing：用户明确要求生成摘要/大纲/FAQ
- memory：用户要求「记住」或更新偏好设置
- web：需要最新互联网信息（新闻/实时数据）
只调用 route_to_specialist 工具，不要回复任何文字。"""


async def orchestrator_node(state: MultiAgentState) -> dict:
    """
    Lyra 主 Agent 节点：做出路由决策。

    使用 LLM function-calling（temperature=0）确保路由稳定，
    延迟约 100-150ms，对用户体验影响可忽略。
    """
    from app.providers.llm import chat_with_tools

    query: str = state.get("query", "")
    portrait: dict | None = state.get("user_portrait")

    # 构建路由消息（含画像上下文提示）
    system = _ROUTE_SYSTEM
    if portrait:
        identity = portrait.get("identity", {})
        role = identity.get("primary_role", "")
        level = identity.get("expertise_level", "")
        focus = portrait.get("research_trajectory", {}).get("current_focus", "")
        if role or level or focus:
            system += f"\n用户背景：{role}，{level}，研究重心：{focus}"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": query},
    ]

    route = "rag"  # 默认路由
    try:
        result = await chat_with_tools(
            messages=messages,
            tools=_ROUTE_TOOLS,
            temperature=0,
        )
        tool_calls = result.get("tool_calls") or []
        if tool_calls:
            args = json.loads(tool_calls[0].get("function", {}).get("arguments", "{}"))
            route = args.get("route", "rag")
            logger.info(
                "Orchestrator routed query to=%s reason=%s",
                route,
                args.get("reasoning", ""),
            )
    except Exception:
        logger.warning("Orchestrator routing failed, defaulting to rag", exc_info=True)

    return {"route": route}


# ---------------------------------------------------------------------------
# Synthesis Node — 接收专家结果，流式生成最终回答
# ---------------------------------------------------------------------------

async def synthesis_node(state: MultiAgentState) -> dict:
    """
    Lyra 汇总节点：将专家输出合成为流式回答。

    使用 adispatch_custom_event 推送 SSE 事件，
    run_agent() 监听 'on_custom_event' 并 yield 给前端。
    """
    from langchain_core.callbacks.manager import adispatch_custom_event
    from app.agents.writing.composer import build_system_prompt, _build_context

    query: str = state.get("query", "")
    history: list[dict] = state.get("messages", [])
    user_memories = state.get("user_memories")
    notebook_summary = state.get("notebook_summary")
    scene_instruction = state.get("scene_instruction")
    user_portrait = state.get("user_portrait")
    db = state.get("db")
    specialist: dict = state.get("specialist_result") or {}

    spec_type = specialist.get("type", "rag")
    chunks: list[dict] = specialist.get("chunks") or []
    web_context: str | None = specialist.get("web_context")
    format_hint: str = specialist.get("format_hint", "")

    # ── 特殊处理：memory 场景直接回复确认 ────────────────────────────────────
    if spec_type == "memory":
        msg = specialist.get("message", "好的，我已经记住了。")
        await adispatch_custom_event("sse", {"type": "token", "content": msg})
        await adispatch_custom_event("sse", {"type": "citations", "citations": []})
        await adispatch_custom_event("sse", {"type": "done"})
        return {}

    # ── 构建系统 prompt（含画像）─────────────────────────────────────────────
    try:
        system_prompt = await build_system_prompt(
            user_memories=user_memories,
            notebook_summary=notebook_summary,
            scene_instruction=scene_instruction,
            db=db,
            user_portrait=user_portrait,
        )
    except Exception:
        system_prompt = ""

    # ── 构建用户消息（含检索上下文）────────────────────────────────────────────
    context_parts: list[str] = []
    citations: list[dict] = []

    if chunks:
        try:
            ctx_text, citations = _build_context(chunks)
            context_parts.append(ctx_text)
        except Exception:
            pass

    if web_context:
        context_parts.append(f"\n=== 互联网搜索结果 ===\n{web_context}")

    if spec_type == "research":
        context_parts.insert(0, "请对以下资料进行深度综合分析：\n")
    elif spec_type == "writing" and format_hint:
        context_parts.insert(0, f"{format_hint}\n")

    # 组装 LLM 消息
    from app.providers.llm import chat_stream

    llm_messages: list[dict] = []
    if system_prompt:
        llm_messages.append({"role": "system", "content": system_prompt})

    # 插入历史（最近 6 条）
    llm_messages.extend(history[-6:])

    user_content = query
    if context_parts:
        context_str = "\n\n".join(context_parts)
        user_content = f"{query}\n\n参考资料：\n{context_str}"

    llm_messages.append({"role": "user", "content": user_content})

    # ── 流式输出 ────────────────────────────────────────────────────────────
    try:
        async for chunk in chat_stream(llm_messages):
            if chunk.get("type") == "token":
                await adispatch_custom_event("sse", chunk)
    except Exception:
        logger.exception("SynthesisNode streaming failed")
        await adispatch_custom_event("sse", {"type": "token", "content": "（回答生成失败，请重试）"})

    await adispatch_custom_event("sse", {"type": "citations", "citations": citations})
    await adispatch_custom_event("sse", {"type": "done"})
    return {}
