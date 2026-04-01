"""
Lyra 深度研究 Orchestrator（多 Agent 图专用）

此 Orchestrator 仅在 react_agent.py 检测到深度研究请求时被调用。
职责：确认是否需要多步深度研究（research），还是实际上可直接回答（direct）。

普通 Q&A / RAG / 闲聊 / 联网搜索均由单 Agent ReAct 循环处理，不经过此图。

MultiAgentState 是贯穿整个图的共享状态，通过 TypedDict 定义。
"""

from __future__ import annotations

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
    active_scene: str                   # 当前场景标签

    # ── 运行时传递（不可序列化，不适合持久化） ──────────────────────────────
    notebook_id: str
    user_id: str
    db: Any                             # AsyncSession（运行时注入）
    global_search: bool
    tool_hint: str | None

    # ── 路由结果 ────────────────────────────────────────────────────────────
    route: str                          # orchestrator_node 填写
    route_reason: str                   # orchestrator_node 填写
    execution_path: str                 # react_agent 预先填入

    # ── 专家输出 ────────────────────────────────────────────────────────────
    specialist_result: dict | None      # 专家 Agent 的结构化输出
    specialist_outputs: list[dict]      # 各 specialist 的结构化输出
    synthesis_packet: dict | None       # 合成阶段使用的压缩上下文


# ---------------------------------------------------------------------------
# 深度研究决策工具（两选一）
# ---------------------------------------------------------------------------

_ORCHESTRATOR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "run_deep_research",
            "description": (
                "启动深度研究模式：需要跨多文档综合分析、对比梳理或系统性深度探讨时使用。"
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "answer_directly",
            "description": "问题相对简单，已有资料可直接回答，无需多步深度研究。",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

_ORCHESTRATOR_SYSTEM = """你是深度研究路由器，判断是否启动多步深度研究模式：

调用 run_deep_research：
- 需要跨多个文档综合对比分析
- 需要系统性梳理某领域全貌
- 用户明确要求深度/全面/综合分析

调用 answer_directly：
- 问题较为聚焦，单次检索即可回答
- 实际上不需要多步分析

只调用一个工具，不要回复任何文字。"""


async def orchestrator_node(state: MultiAgentState) -> dict:
    """
    深度研究路由器：确认是否需要多步深度研究。
    进入此图的请求已被 react_agent 初步判断为研究类，默认走 research。
    """
    from app.providers.llm import chat_with_tools
    from langchain_core.callbacks.manager import adispatch_custom_event

    query: str = state.get("query", "")
    portrait: dict | None = state.get("user_portrait")
    active_scene: str = state.get("active_scene", "research")

    system = _ORCHESTRATOR_SYSTEM
    if portrait:
        identity = portrait.get("identity", {})
        role = identity.get("primary_role", "")
        level = identity.get("expertise_level", "")
        if role or level:
            system += f"\n用户背景：{role}，{level}"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": query},
    ]

    route = "research"  # 默认：进入此图说明已初步判断为研究类
    try:
        result = await chat_with_tools(
            messages=messages,
            tools=_ORCHESTRATOR_TOOLS,
            temperature=0,
        )
        tool_calls = result.get("tool_calls") or []
        if tool_calls:
            fn_name = tool_calls[0].get("function", {}).get("name", "")
            route = "direct" if fn_name == "answer_directly" else "research"
            logger.info("Research orchestrator decided route=%s for query=%r", route, query[:60])
    except Exception:
        logger.warning("Research orchestrator failed, defaulting to research", exc_info=True)

    if route == "research":
        await adispatch_custom_event("sse", {
            "type": "thought",
            "content": "分析请求 → 启动**深度研究**模式",
        })
        await adispatch_custom_event("sse", {
            "type": "agent_trace",
            "event": "route_selected",
            "reason": "orchestrator_research",
            "detail": f"scene={active_scene}",
        })
        return {"route": route, "route_reason": "orchestrator_research"}

    await adispatch_custom_event("sse", {
        "type": "agent_trace",
        "event": "route_selected",
        "reason": "orchestrator_direct",
        "detail": f"scene={active_scene}",
    })
    return {"route": route, "route_reason": "orchestrator_direct"}


def _build_synthesis_packet(state: MultiAgentState) -> dict:
    outputs: list[dict] = state.get("specialist_outputs") or []
    packet: dict[str, object] = {
        "summaries": [],
        "chunks": [],
        "web_context": "",
    }

    summaries: list[dict] = []
    chunks: list[dict] = []
    seen_titles: dict[str, int] = {}
    web_parts: list[str] = []

    for output in outputs:
        specialist = output.get("specialist", output.get("type", "unknown"))
        summary = str(output.get("summary") or "").strip()
        if summary:
            summaries.append({"specialist": specialist, "summary": summary[:300]})

        for chunk in output.get("chunks") or []:
            title = str(chunk.get("source_title", "未知来源"))
            if seen_titles.get(title, 0) >= 2:
                continue
            seen_titles[title] = seen_titles.get(title, 0) + 1
            chunks.append(chunk)
            if len(chunks) >= 10:
                break
        if len(chunks) >= 10:
            break

    for output in outputs:
        web_context = str(output.get("web_context") or "").strip()
        if web_context:
            web_parts.append(web_context[:2000])

    packet["summaries"] = summaries[:4]
    packet["chunks"] = chunks[:10]
    packet["web_context"] = "\n\n".join(web_parts)[:3000]
    return packet


# ---------------------------------------------------------------------------
# Synthesis Node — 接收专家结果，流式生成最终回答
# ---------------------------------------------------------------------------

async def synthesis_node(state: MultiAgentState) -> dict:
    """
    汇总节点：将深度研究专家的输出合成为流式回答。
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
    synthesis_packet = state.get("synthesis_packet") or _build_synthesis_packet(state)

    spec_type = specialist.get("type", "research")
    chunks: list[dict] = synthesis_packet.get("chunks") or specialist.get("chunks") or []
    web_context: str | None = synthesis_packet.get("web_context") or specialist.get("web_context")

    is_direct = spec_type == "direct"

    # ── 构建系统 prompt（含画像）─────────────────────────────────────────────
    try:
        system_prompt = await build_system_prompt(
            user_memories=user_memories,
            notebook_summary=notebook_summary,
            scene_instruction=scene_instruction,
            db=db,
            user_portrait=user_portrait,
            tool_schemas=[],
        )
    except Exception:
        system_prompt = ""

    # ── 构建检索上下文 ─────────────────────────────────────────────────────
    context_parts: list[str] = []
    citations: list[dict] = []

    if not is_direct:
        specialist_summaries = synthesis_packet.get("summaries") or []
        if specialist_summaries:
            summary_text = "\n".join(
                f"- {item['specialist']}: {item['summary']}"
                for item in specialist_summaries
            )
            context_parts.append(f"=== 专家摘要 ===\n{summary_text}")
        if chunks:
            try:
                ctx_text, citations = _build_context(chunks)
                context_parts.append(ctx_text)
            except Exception:
                pass
        if web_context:
            context_parts.append(f"\n=== 互联网搜索结果 ===\n{web_context}")
        if context_parts:
            context_parts.insert(0, "请对以下资料进行深度综合分析：\n")

    # ── 组装 LLM 消息 ────────────────────────────────────────────────────────
    from app.providers.llm import chat_stream

    llm_messages: list[dict] = []
    if system_prompt:
        llm_messages.append({"role": "system", "content": system_prompt})
    llm_messages.extend(history[-6:])

    user_content = query
    if context_parts:
        user_content = f"{query}\n\n参考资料：\n" + "\n\n".join(context_parts)
    llm_messages.append({"role": "user", "content": user_content})

    # ── 流式输出 ────────────────────────────────────────────────────────────
    if not is_direct:
        await adispatch_custom_event("sse", {"type": "thought", "content": "整合研究资料，生成深度回答…"})
        await adispatch_custom_event("sse", {
            "type": "agent_trace",
            "event": "synthesis",
            "reason": "compressed_specialist_packet",
            "detail": f"chunks={len(chunks)};web={bool(web_context)}",
        })
    try:
        async for chunk in chat_stream(llm_messages):
            if chunk.get("type") in ("token", "reasoning"):
                await adispatch_custom_event("sse", chunk)
    except Exception:
        logger.exception("SynthesisNode streaming failed")
        await adispatch_custom_event("sse", {"type": "token", "content": "（回答生成失败，请重试）"})

    await adispatch_custom_event("sse", {"type": "citations", "citations": citations})
    await adispatch_custom_event("sse", {"type": "done"})
    return {}
