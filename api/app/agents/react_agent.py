"""
ReAct Agent: multi-step reasoning + tool calling loop.

Emits SSE-compatible dicts:
  {"type": "thought",     "content": "..."}   Agent reasoning step
  {"type": "tool_call",   "tool": "...", "input": {...}}
  {"type": "tool_result", "content": "..."}   First 300 chars preview
  {"type": "token",       "content": "..."}   Final answer tokens
  {"type": "citations",   "citations": [...]}
  {"type": "done"}
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.composer import build_system_prompt
from app.agents.tools import ToolContext, execute_tool
from app.providers.llm import chat_stream, chat_with_tools

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 5

# Conversational phrases that definitely don't need knowledge retrieval
_CONVERSATIONAL_PATTERNS = [
    "你好", "您好", "hi", "hello", "嗨",
    "谢谢", "感谢", "thanks", "thank you",
    "好的", "好", "行", "ok", "okay", "嗯", "明白",
    "再见", "拜拜", "bye",
    "继续", "下一个", "还有呢",
    "你是谁", "你叫什么", "你能做什么",
]

def _is_knowledge_query(query: str) -> bool:
    """Return True if the query likely needs knowledge retrieval.

    Heuristics:
    - Very short queries (≤6 chars) that match conversational patterns → False
    - Queries shorter than 4 chars → always conversational → False
    - Everything else → assume knowledge-seeking → True
    """
    q = query.strip()
    if len(q) < 4:
        return False
    q_lower = q.lower()
    for pat in _CONVERSATIONAL_PATTERNS:
        # Short exact-match or starts-with check to avoid false positives
        if q_lower == pat or (len(q) <= 8 and q_lower.startswith(pat)):
            return False
    return True


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
    scene_instruction — L4 scene-specific behaviour directive injected into system prompt.
    global_search=True → search across all user notebooks (used by global chat).
    tool_hint — optional tool selection hint from frontend Tools menu.
    attachment_ids — temp upload IDs whose content is injected as user context.
    """
    from app.skills.registry import skill_registry

    # Dynamically load active skills for this user (gating + DB enable/disable)
    try:
        active_skills = await skill_registry.get_active_skills(user_id, db)
        # Exclude MarkdownSkills — they have no callable schema (prompt-injected only)
        tool_skills = [s for s in active_skills if not s.is_markdown_skill]
        tool_schemas = [s.get_schema() for s in tool_skills]
        thought_labels = {
            s.get_schema()["name"]: s.meta.thought_label for s in tool_skills
        }
    except Exception:
        logger.warning("Failed to load active skills, falling back to empty tool list", exc_info=True)
        active_skills = []
        tool_schemas = []
        thought_labels = {}

    tool_ctx = ToolContext(notebook_id=notebook_id, user_id=user_id, db=db, global_search=global_search)
    system_prompt = await build_system_prompt(user_memories, notebook_summary, scene_instruction, db=db)

    if tool_hint and tool_hint in TOOL_HINT_PROMPTS:
        system_prompt += f"\n\n## 当前工具指令\n{TOOL_HINT_PROMPTS[tool_hint]}"

    # Load attachment content from temp storage
    att = await _load_attachment_context(attachment_ids, user_id)

    # Seed the message list
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-10:])

    if att.has_content:
        if att.text_parts:
            messages.append({"role": "user", "content": f"用户上传了以下附件作为参考资料：\n\n{att.text}"})
            messages.append({"role": "assistant", "content": "好的，我已阅读附件内容，请继续。"})

        if att.image_parts:
            # Build multimodal user message with images + query text
            content_blocks: list[dict] = [
                {"type": "text", "text": query},
                *att.image_parts,
            ]
            messages.append({"role": "user", "content": content_blocks})
        else:
            messages.append({"role": "user", "content": query})
    else:
        messages.append({"role": "user", "content": query})

    for iteration in range(MAX_ITERATIONS):
        response = await chat_with_tools(messages, tool_schemas)

        if response["finish_reason"] == "tool_calls":
            # Serialize the Pydantic ChatCompletionMessage → plain dict so all
            # entries in `messages` stay as plain dicts (avoids AttributeError on .get())
            raw = response["raw_message"]
            assistant_dict: dict = {"role": "assistant", "content": raw.content or ""}
            if raw.tool_calls:
                assistant_dict["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in raw.tool_calls
                ]
            messages.append(assistant_dict)

            for tc in response["tool_calls"]:
                label = thought_labels.get(tc["name"], f"⚙️ 调用 {tc['name']}")
                yield {"type": "thought", "content": label}
                yield {"type": "tool_call", "tool": tc["name"], "input": tc["arguments"]}

                result = await execute_tool(tc, tool_ctx)

                # Emit mind map data as a dedicated event if the tool produced one
                if tool_ctx.mind_map_data is not None:
                    yield {"type": "mind_map", "data": tool_ctx.mind_map_data}
                    tool_ctx.mind_map_data = None

                # Emit note_created event so the frontend can invalidate its cache
                if tool_ctx.created_note_id is not None:
                    yield {
                        "type": "note_created",
                        "note_id": tool_ctx.created_note_id,
                        "note_title": tool_ctx.created_note_title,
                        "notebook_id": tool_ctx.notebook_id,
                    }
                    # Strip the internal marker prefix from the LLM-visible result
                    if result.startswith("NOTE_CREATED:"):
                        result = result.split(":", 2)[-1]
                    tool_ctx.created_note_id = None
                    tool_ctx.created_note_title = None

                if tc["name"] == "search_notebook_knowledge" and tool_ctx.collected_citations:
                    summary_lines = [
                        f"[片段{i}] 来源：《{c['source_title']}》（相关度 {c.get('score', 0):.0%}）"
                        for i, c in enumerate(tool_ctx.collected_citations, 1)
                    ]
                    yield {"type": "tool_result", "content": f"✓ 找到 {len(summary_lines)} 个相关片段\n" + "\n".join(summary_lines)}
                elif tc["name"] == "web_search" and tool_ctx.collected_citations:
                    web_citations = [c for c in tool_ctx.collected_citations if str(c.get("source_id", "")).startswith("web-search")]
                    summary_lines = [
                        f"[网络{i}] 《{c['source_title']}》（相关度 {c.get('score', 0):.0%}）"
                        for i, c in enumerate(web_citations, 1)
                    ]
                    yield {"type": "tool_result", "content": f"✓ 搜索到 {len(summary_lines)} 条网络结果\n" + "\n".join(summary_lines)}
                else:
                    yield {"type": "tool_result", "content": result[:300]}

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                })

        elif response["finish_reason"] == "stop":
            # Collect tool results accumulated so far
            tool_contents = [
                m["content"] for m in messages
                if isinstance(m, dict) and m.get("role") == "tool"
            ]

            # Only fall back to RAG if:
            # 1. No tools were called (LLM answered directly), AND
            # 2. The query looks knowledge-seeking (not pure conversation)
            if not tool_contents and _is_knowledge_query(query):
                from app.agents.retrieval import retrieve_chunks
                chunks = await retrieve_chunks(
                    query, tool_ctx.notebook_id, tool_ctx.db,
                    global_search=tool_ctx.global_search,
                    user_id=tool_ctx.user_id,
                )
                if chunks:
                    tool_ctx.collected_citations = [
                        {
                            "source_id": c["source_id"],
                            "chunk_id": c["chunk_id"],
                            "excerpt": c["excerpt"],
                            "source_title": c["source_title"],
                            "score": c.get("score"),
                        }
                        for c in chunks
                    ]
                    tool_contents = [c["content"] for c in chunks]

            # Strip tool-exchange messages; keep system / user / plain assistant
            clean: list[dict] = [
                m for m in messages
                if isinstance(m, dict)
                and m.get("role") not in ("tool",)
                and not (m.get("role") == "assistant" and m.get("tool_calls"))
            ]

            # Inject context before the last user message
            if tool_contents:
                combined = "\n\n---\n\n".join(tool_contents[:6])
                last_user = next(
                    (i for i in range(len(clean) - 1, -1, -1) if clean[i].get("role") == "user"),
                    -1,
                )
                if last_user >= 0:
                    clean.insert(last_user, {"role": "user", "content": f"以下是检索到的参考资料：\n\n{combined}"})
                    clean.insert(last_user + 1, {"role": "assistant", "content": "好的，我已阅读参考资料，请继续。"})

            async for token in chat_stream(clean):
                yield {"type": "token", "content": token}

            yield {"type": "citations", "citations": tool_ctx.collected_citations}
            yield {"type": "done"}
            return

        else:
            break

    # Fallback if max iterations reached: stream direct answer without tools
    logger.warning("ReAct agent reached MAX_ITERATIONS=%d for query: %s", MAX_ITERATIONS, query[:80])
    yield {"type": "thought", "content": "（已达到最大推理步数，直接回答）"}

    fallback_messages = [
        {"role": "system", "content": system_prompt},
        *history[-6:],
        {"role": "user", "content": query},
    ]
    async for token in chat_stream(fallback_messages):
        yield {"type": "token", "content": token}

    yield {"type": "citations", "citations": tool_ctx.collected_citations}
    yield {"type": "done"}


class _AttachmentContent:
    """Holds both text and image parts from uploaded attachments."""

    def __init__(self) -> None:
        self.text_parts: list[str] = []
        self.image_parts: list[dict] = []  # OpenAI image_url content blocks

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
