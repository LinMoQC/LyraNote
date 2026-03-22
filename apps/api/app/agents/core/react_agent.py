"""
ReAct Agent: multi-step reasoning + tool calling loop.

This module is now a thin adapter over the Brain/Engine architecture.
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

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 5

TOOL_HINT_PROMPTS: dict[str, str] = {
    "summarize": "用户明确要求对笔记本内容生成摘要。请直接调用 summarize_sources 工具，artifact_type='summary'。",
    "insights": "用户要求提取关键洞察。请先调用 search_notebook_knowledge 检索核心内容，然后从中提炼出 5-8 条关键洞察（核心发现、趋势、反直觉结论等），以结构化列表呈现。每条洞察用加粗标题+说明。",
    "outline": "用户要求生成大纲。请调用 summarize_sources 工具，artifact_type='outline'。",
    "deep_read": "用户要求对来源进行深度阅读分析。请调用 deep_read_sources 工具进行逐段深度分析。",
    "compare": "用户要求对比多个来源。请调用 compare_sources 工具进行结构化对比分析。",
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
    Delegates to AgentBrain (decision) + AgentEngine (execution).
    """
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

    # ── Build system prompt ───────────────────────────────────────────────
    tool_ctx = ToolContext(
        notebook_id=notebook_id, user_id=user_id, db=db, global_search=global_search,
        history=list(history[-6:]),  # last 3 turns for coreference resolution
    )
    system_prompt = await build_system_prompt(
        user_memories, notebook_summary, scene_instruction, db=db
    )
    if tool_hint and tool_hint in TOOL_HINT_PROMPTS:
        system_prompt += f"\n\n## 当前工具指令\n{TOOL_HINT_PROMPTS[tool_hint]}"

    # ── Load attachments ──────────────────────────────────────────────────
    att = await _load_attachment_context(attachment_ids, user_id)

    # ── Seed message list ─────────────────────────────────────────────────
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

    # ── Create Brain + Engine + State, then run ───────────────────────────
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


# ── Attachment loading (unchanged) ────────────────────────────────────────


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
