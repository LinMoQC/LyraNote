"""
ReAct Agent: multi-step reasoning + tool calling loop.

This module now supports two execution modes:
  1. Multi-Agent (default): Lyra Orchestrator → Specialists → Synthesis
     Uses LangGraph StateGraph with conditional routing.
  2. Single-Agent (fallback): Original Brain/Engine ReAct loop (5 steps max).
     Activated when the multi-agent graph is unavailable or attachment_ids are set.

The public API (``run_agent``) is preserved for backward compatibility.

Emits SSE-compatible dicts:
  {"type": "thought",     "content": "..."}   Agent reasoning step
  {"type": "tool_call",   "tool": "...", "input": {...}}
  {"type": "tool_result", "content": "..."}   First 300 chars preview
  {"type": "token",       "content": "..."}   Final answer tokens
  {"type": "citations",   "citations": [...]}
  {"type": "done"}
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.core.brain import AgentBrain
from app.agents.writing.composer import build_system_prompt
from app.agents.core.engine import AgentEngine
from app.agents.core.state import AgentState
from app.agents.core.tools import ToolContext
from app.mcp.skill import load_mcp_skills

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 5

TOOL_HINT_PROMPTS: dict[str, str] = {
    "summarize": "用户点击了「摘要」功能，希望对当前笔记本内容生成一份结构化摘要。请根据需要检索相关内容，然后调用 summarize_sources 工具（artifact_type='summary'）完成任务。",
    "insights": "用户点击了「洞察」功能，希望从笔记本内容中提炼关键洞察。请先检索核心内容，再提炼出 5-8 条关键洞察（核心发现、趋势、反直觉结论等），以结构化列表呈现，每条用加粗标题配说明。",
    "outline": "用户点击了「大纲」功能，希望基于笔记本内容生成结构化大纲。请根据需要检索相关内容，然后调用 summarize_sources 工具（artifact_type='outline'）完成任务。",
    "deep_read": "用户点击了「深度阅读」功能，希望对来源进行逐段深度分析。请调用 deep_read_sources 工具完成任务。",
    "compare": "用户点击了「对比分析」功能，希望对多个来源的观点进行结构化对比。请调用 compare_sources 工具完成任务。",
}


async def run_agent(
    query: str,
    notebook_id: str,
    user_id: UUID,
    history: list[dict],
    db: AsyncSession,
    user_memories: list[dict] | None = None,
    notebook_summary: dict | None = None,
    scene_instruction: str | None = None,
    global_search: bool = False,
    tool_hint: str | None = None,
    attachment_ids: list[str] | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Main entry point. Yields SSE event dicts until done.

    Routing logic:
      - With attachments → always use single-agent (image/file context needed)
      - With tool_hint → always use single-agent (explicit tool override)
      - Otherwise → try multi-agent graph, fall back to single-agent on failure
    """
    # Attachments and tool_hint require the full Brain/Engine loop
    use_single = bool(attachment_ids) or bool(tool_hint)

    if not use_single:
        try:
            from app.agents.multi_agent_graph import MULTI_AGENT_GRAPH
            if MULTI_AGENT_GRAPH is not None:
                async for event in _run_agent_multi(
                    query=query,
                    notebook_id=notebook_id,
                    user_id=user_id,
                    history=history,
                    db=db,
                    user_memories=user_memories,
                    notebook_summary=notebook_summary,
                    scene_instruction=scene_instruction,
                    global_search=global_search,
                ):
                    yield event
                return
        except Exception:
            logger.warning("Multi-agent graph failed, falling back to single-agent", exc_info=True)

    async for event in _run_agent_single(
        query=query,
        notebook_id=notebook_id,
        user_id=user_id,
        history=history,
        db=db,
        user_memories=user_memories,
        notebook_summary=notebook_summary,
        scene_instruction=scene_instruction,
        global_search=global_search,
        tool_hint=tool_hint,
        attachment_ids=attachment_ids,
    ):
        yield event


# ---------------------------------------------------------------------------
# Multi-Agent implementation (LangGraph)
# ---------------------------------------------------------------------------

async def _run_agent_multi(
    query: str,
    notebook_id: str,
    user_id: UUID,
    history: list[dict],
    db: AsyncSession,
    user_memories: list[dict] | None = None,
    notebook_summary: dict | None = None,
    scene_instruction: str | None = None,
    global_search: bool = False,
) -> AsyncGenerator[dict, None]:
    """Run the LangGraph multi-agent graph and stream SSE events."""
    from app.agents.multi_agent_graph import MULTI_AGENT_GRAPH
    from app.agents.portrait.loader import load_latest_portrait
    from app.agents.orchestrator import MultiAgentState

    # Pre-load user portrait to inject into orchestrator context
    user_portrait: dict | None = None
    try:
        user_portrait = await load_latest_portrait(db, user_id)
    except Exception:
        pass

    initial_state: MultiAgentState = {
        "query": query,
        "messages": history,
        "user_memories": user_memories,
        "user_portrait": user_portrait,
        "notebook_summary": notebook_summary,
        "scene_instruction": scene_instruction,
        "notebook_id": notebook_id,
        "user_id": str(user_id),
        "db": db,
        "global_search": global_search,
        "tool_hint": None,
        "route": "",
        "specialist_result": None,
    }

    config = {"configurable": {"thread_id": str(user_id)}}

    async for event in MULTI_AGENT_GRAPH.astream_events(
        initial_state, version="v2", config=config
    ):
        if event["event"] == "on_custom_event" and event["name"] == "sse":
            yield event["data"]


# ---------------------------------------------------------------------------
# Single-Agent implementation (original Brain/Engine ReAct loop)
# ---------------------------------------------------------------------------

async def _run_agent_single(
    query: str,
    notebook_id: str,
    user_id: UUID,
    history: list[dict],
    db: AsyncSession,
    user_memories: list[dict] | None = None,
    notebook_summary: dict | None = None,
    scene_instruction: str | None = None,
    global_search: bool = False,
    tool_hint: str | None = None,
    attachment_ids: list[str] | None = None,
) -> AsyncGenerator[dict, None]:
    """Original Brain/Engine ReAct loop (preserved as fallback)."""
    from app.skills.registry import skill_registry

    # ── Load active skills ────────────────────────────────────────────────
    try:
        active_skills = await skill_registry.get_active_skills(user_id, db)
        tool_skills = [s for s in active_skills if not s.is_markdown_skill]
        tool_schemas = [s.get_schema() for s in tool_skills]
        thought_labels = {
            s.get_schema()["name"]: s.meta.thought_label for s in tool_skills
        }
    except Exception:
        logger.warning("Failed to load active skills, falling back to empty tool list", exc_info=True)
        tool_schemas = []
        thought_labels = {}
        tool_skills = []

    # ── Load MCP tools ────────────────────────────────────────────────────
    mcp_skills = await load_mcp_skills(user_id, db)
    if mcp_skills:
        tool_schemas.extend(s.get_schema() for s in mcp_skills)
        thought_labels.update(
            {s.get_schema()["name"]: s.meta.thought_label for s in mcp_skills}
        )

    mcp_skill_map = {s.meta.name: s for s in mcp_skills}

    tool_ctx = ToolContext(
        notebook_id=notebook_id, user_id=user_id, db=db, global_search=global_search,
        history=list(history[-6:]),
        mcp_skill_map=mcp_skill_map,
    )
    system_prompt = await build_system_prompt(
        user_memories, notebook_summary, scene_instruction, db=db,
        tool_schemas=tool_schemas,
    )
    if tool_hint and tool_hint in TOOL_HINT_PROMPTS:
        system_prompt += f"\n\n## 当前工具指令\n{TOOL_HINT_PROMPTS[tool_hint]}"

    att = await _load_attachment_context(attachment_ids, user_id)

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-10:])

    if att.has_content:
        if att.text_parts:
            messages.append({"role": "user", "content": f"用户上传了以下附件作为参考资料：\n\n{att.text}"})
            messages.append({"role": "assistant", "content": "好的，我已阅读附件内容，请继续。"})
        if att.image_parts:
            content_blocks: list[dict] = [
                {"type": "text", "text": query},
                *att.image_parts,
            ]
            messages.append({"role": "user", "content": content_blocks})
        else:
            messages.append({"role": "user", "content": query})
    else:
        messages.append({"role": "user", "content": query})

    state = AgentState(
        messages=messages,
        phase="init",
        max_steps=MAX_ITERATIONS,
        query=query,
        global_search=global_search,
    )
    brain = AgentBrain(has_tools=bool(tool_schemas), max_steps=MAX_ITERATIONS)
    engine = AgentEngine(
        brain=brain,
        tool_ctx=tool_ctx,
        tool_schemas=tool_schemas,
        thought_labels=thought_labels,
    )

    async for event in engine.run(state):
        yield event


class _AttachmentContent:
    """Holds both text and image parts from uploaded attachments."""

    def __init__(self) -> None:
        self.text_parts: list[str] = []
        self.image_parts: list[dict] = []

    @property
    def has_content(self) -> bool:
        return bool(self.text_parts) or bool(self.image_parts)

    @property
    def text(self) -> str:
        return "\n\n".join(self.text_parts)


_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
_EXT_TO_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
}


async def _load_attachment_context(
    attachment_ids: list[str] | None,
    user_id: UUID,
) -> _AttachmentContent:
    """Read temp-uploaded files. Returns text parts and base64 image blocks."""
    result = _AttachmentContent()
    if not attachment_ids:
        return result

    import base64
    from app.providers.storage import storage

    for aid in attachment_ids[:5]:
        found = False
        for ext in ("", ".pdf", ".txt", ".md", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp"):
            key = f"temp/{user_id}/{aid}{ext}"
            try:
                if not await storage().exists(key):
                    continue
                found = True

                if ext.lower() in _IMAGE_EXTS:
                    data = await storage().download(key)
                    mime = _EXT_TO_MIME.get(ext.lower(), "image/png")
                    b64 = base64.b64encode(data).decode("ascii")
                    result.image_parts.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime};base64,{b64}",
                            "detail": "auto",
                        },
                    })
                    break

                data = await storage().download(key)
                if ext == ".pdf":
                    try:
                        import pdfplumber
                        import io
                        with pdfplumber.open(io.BytesIO(data)) as pdf:
                            text = "\n".join(
                                page.extract_text() or "" for page in pdf.pages[:20]
                            )
                        if text.strip():
                            result.text_parts.append(f"【附件: {aid}{ext}】\n{text[:8000]}")
                    except Exception:
                        result.text_parts.append(f"[附件 {aid}: PDF 文件，无法提取文本]")
                else:
                    try:
                        text = data.decode("utf-8", errors="replace")
                        result.text_parts.append(f"【附件: {aid}{ext}】\n{text[:8000]}")
                    except Exception:
                        result.text_parts.append(f"[附件 {aid}: 二进制文件]")
                break
            except FileNotFoundError:
                continue
            except Exception as exc:
                logger.warning("Failed to load attachment %s: %s", aid, exc)
                continue

        if not found:
            logger.warning("Attachment %s not found in temp storage for user %s", aid, user_id)

    return result
