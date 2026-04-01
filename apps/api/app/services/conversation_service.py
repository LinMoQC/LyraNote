"""
Conversation service — business logic for conversations and messages.

Inspired by LobeHub's class-based service pattern:
  service = ConversationService(db, user_id)
  result = await service.list_by_notebook(notebook_id)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import random
from collections.abc import AsyncGenerator
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models import Conversation, Message, Notebook

logger = logging.getLogger(__name__)

MEMORY_FLUSH_THRESHOLD = 20


# Matches fenced code blocks: ```genui / ```json / ``` followed by a JSON object
_GENUI_BLOCK_RE = re.compile(r"```(?:genui|json)?\s*\n(\{[\s\S]*?\})\s*\n```", re.MULTILINE)


def _is_excalidraw_data(data: object) -> bool:
    """Return True if *data* is a GenUI excalidraw block (direct or group-wrapped)."""
    if not isinstance(data, dict):
        return False
    node_type = data.get("type", "")
    if isinstance(node_type, str) and node_type.startswith("excalidraw__"):
        return True
    for child in data.get("components", []) or []:
        if isinstance(child, dict):
            t = child.get("type", "")
            if isinstance(t, str) and t.startswith("excalidraw__"):
                return True
    return False


def _extract_genui_from_content(content: str) -> tuple[str, dict | None]:
    """Scan LLM text for embedded GenUI JSON blocks and extract the first match.

    When the LLM embeds an excalidraw__* JSON block inside a fenced code block
    instead of calling a tool, this function detects it, builds an mcp_result
    payload, and returns the cleaned content (block removed) alongside it.

    Returns (cleaned_content, mcp_result_payload_or_None).
    """
    for m in _GENUI_BLOCK_RE.finditer(content):
        raw = m.group(1).strip()
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            continue
        if not _is_excalidraw_data(data):
            continue
        cleaned = (content[: m.start()].rstrip() + "\n" + content[m.end() :].lstrip()).strip()
        return cleaned, {"tool": "excalidraw__create_view", "data": data}
    return content, None


class ConversationService:
    """Conversation domain business logic."""

    def __init__(self, db: AsyncSession, user_id: UUID):
        self.db = db
        self.user_id = user_id

    # ── Conversation CRUD ─────────────────────────────────────────────────────

    async def list_by_notebook(
        self, notebook_id: UUID, *, offset: int = 0, limit: int = 50, source: str = "chat"
    ) -> list[Conversation]:
        await self._assert_notebook_owner(notebook_id)
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.notebook_id == notebook_id)
            .where(Conversation.source == source)
            .order_by(Conversation.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, notebook_id: UUID | None, title: str | None, source: str = "chat") -> Conversation:
        if notebook_id is not None:
            await self._assert_notebook_owner(notebook_id)
        conv = Conversation(
            notebook_id=notebook_id,
            user_id=self.user_id,
            title=title,
            source=source,
        )
        self.db.add(conv)
        await self.db.flush()
        await self.db.refresh(conv)
        return conv

    async def list_global(self, *, offset: int = 0, limit: int = 50) -> list[Conversation]:
        """List conversations not tied to any notebook (global chat page)."""
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.user_id == self.user_id)
            .where(Conversation.notebook_id.is_(None))
            .where(Conversation.source == "chat")
            .order_by(Conversation.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def delete(self, conversation_id: UUID) -> None:
        conv = await self._get_owned(conversation_id)
        await self.db.delete(conv)

    # ── Message operations ────────────────────────────────────────────────────

    async def list_messages(
        self, conversation_id: UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Message]:
        await self._get_owned(conversation_id)
        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc(), Message.role.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(reversed(result.scalars().all()))

    async def save_message(
        self,
        conversation_id: UUID,
        role: str,
        content: str,
        citations: list[dict] | None = None,
        reasoning: str | None = None,
    ) -> Message:
        await self._get_owned(conversation_id)
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            citations=citations,
            reasoning=reasoning,
        )
        self.db.add(msg)
        await self.db.flush()
        await self.db.refresh(msg)
        return msg

    async def send_message(self, conversation_id: UUID, content: str) -> Message:
        """Non-streaming: save user message, run RAG + compose, return assistant reply."""
        conv = await self._get_owned(conversation_id)
        user_msg = Message(conversation_id=conversation_id, role="user", content=content)
        self.db.add(user_msg)
        await self.db.flush()

        history = await self._load_history(conversation_id)

        from app.agents.rag.graph_retrieval import graph_augmented_context
        from app.agents.rag.retrieval import retrieve_chunks
        from app.agents.writing.composer import compose_answer
        from app.agents.memory import get_user_memories, get_notebook_summary

        user_memories = await get_user_memories(self.user_id, self.db)
        notebook_summary = await get_notebook_summary(conv.notebook_id, self.db)
        if conv.notebook_id:
            chunks, graph_ctx = await asyncio.gather(
                retrieve_chunks(
                    content,
                    str(conv.notebook_id),
                    self.db,
                    user_id=self.user_id,
                ),
                graph_augmented_context(content, str(conv.notebook_id), self.db),
            )
        else:
            chunks = await retrieve_chunks(
                content,
                None,
                self.db,
                global_search=True,
                user_id=self.user_id,
            )
            graph_ctx = ""
        answer, citations = await compose_answer(
            content,
            chunks,
            history,
            user_memories=user_memories,
            notebook_summary=notebook_summary,
            db=self.db,
            extra_graph_context=graph_ctx or None,
        )

        assistant_msg = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=answer,
            citations=citations,
        )
        self.db.add(assistant_msg)
        await self.db.flush()
        await self.db.refresh(assistant_msg)
        return assistant_msg

    async def stream_agent(
        self,
        conversation_id: UUID,
        content: str,
        *,
        global_search: bool = False,
        tool_hint: str | None = None,
        attachment_ids: list[str] | None = None,
        attachments_meta: list[dict] | None = None,
        thinking_enabled: bool | None = None,
    ) -> AsyncGenerator[str, None]:
        """Run the ReAct agent and yield SSE lines."""
        conv = await self._get_owned(conversation_id)

        user_msg = Message(
            conversation_id=conversation_id,
            role="user",
            content=content,
            attachments=attachments_meta,
        )
        self.db.add(user_msg)
        await self.db.flush()

        history = await self._load_history(conversation_id)

        from app.agents.core.react_agent import run_agent
        from app.agents.memory import build_memory_context, get_notebook_summary
        from app.agents.writing.scene_detector import detect_scene, get_scene_instruction

        # 提前启动 detect_scene（LLM 调用），使其与后续 DB 操作并行
        detect_task = asyncio.create_task(detect_scene(content))

        # When notebook_id is None (global chat), skip notebook-scoped context
        notebook_summary = await get_notebook_summary(conv.notebook_id, self.db) if conv.notebook_id else None

        # 此时 LLM 调用已在后台运行，大概率已完成
        scene = await detect_task

        try:
            user_memories = await build_memory_context(
                self.user_id, content, self.db, top_k=5, scene=scene
            )
        except Exception as exc:
            logger.warning("build_memory_context failed: %s", exc)
            user_memories = []

        scene_instruction = get_scene_instruction(scene)

        full_content: list[str] = []
        full_reasoning: list[str] = []
        citations: list[dict] = []
        agent_steps: list[dict] = []
        speed_metrics: dict | None = None
        mind_map_data: dict | None = None
        diagram_data: dict | None = None
        mcp_result_data: dict | None = None
        ui_elements_data: list[dict] = []

        async for event in run_agent(
            query=content,
            notebook_id=str(conv.notebook_id) if conv.notebook_id else None,
            user_id=self.user_id,
            history=history,
            db=self.db,
            user_memories=user_memories,
            notebook_summary=notebook_summary,
            scene_instruction=scene_instruction,
            active_scene=scene,
            global_search=True if conv.notebook_id is None else global_search,
            tool_hint=tool_hint,
            attachment_ids=attachment_ids,
            thinking_enabled=thinking_enabled,
        ):
            event_type = event.get("type")

            if event_type == "token":
                full_content.append(event["content"])
                yield f"data: {json.dumps(event)}\n\n"

            elif event_type == "citations":
                citations = event["citations"]
                yield f"data: {json.dumps(event)}\n\n"

            elif event_type in ("thought", "tool_call", "tool_result"):
                agent_steps.append({
                    "type": event_type,
                    "content": event.get("content"),
                    "tool": event.get("tool"),
                    "input": event.get("input"),
                })
                yield f"data: {json.dumps(event)}\n\n"

            elif event_type == "reasoning":
                chunk = event.get("content")
                if chunk:
                    full_reasoning.append(chunk)
                yield f"data: {json.dumps(event)}\n\n"

            elif event_type == "error":
                full_content.append(event.get("content", ""))
                yield f"data: {json.dumps(event)}\n\n"

            elif event_type == "speed":
                speed_metrics = {
                    "ttft_ms": event.get("ttft_ms", 0),
                    "tps": event.get("tps", 0),
                    "tokens": event.get("tokens", 0),
                }
                yield f"data: {json.dumps(event)}\n\n"

            elif event_type == "done":
                content_text = "".join(full_content)
                reasoning_text = "".join(full_reasoning).strip() or None
                # If the LLM embedded a GenUI JSON block in text (instead of calling
                # a tool), extract it now so the frontend can render it properly.
                if mcp_result_data is None:
                    content_text, extracted_mcp = _extract_genui_from_content(content_text)
                    if extracted_mcp:
                        mcp_result_data = extracted_mcp
                        # Notify the frontend: set mcpResult and replace the content
                        # (remove the raw JSON code block that was streamed as tokens).
                        yield f"data: {json.dumps({'type': 'mcp_result', 'data': extracted_mcp})}\n\n"
                        yield f"data: {json.dumps({'type': 'content_replace', 'content': content_text})}\n\n"
                if content_text:
                    assistant_msg = Message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=content_text,
                        reasoning=reasoning_text,
                        citations=citations,
                        agent_steps=agent_steps or None,
                        speed=speed_metrics,
                        mind_map=mind_map_data,
                        diagram=diagram_data,
                        mcp_result=mcp_result_data,
                        ui_elements=ui_elements_data or None,
                    )
                    self.db.add(assistant_msg)
                    await self.db.flush()

                    self._dispatch_post_chat_tasks(
                        conversation_id, scene, user_memories
                    )

                    event = {**event, "message_id": str(assistant_msg.id)}
                yield f"data: {json.dumps(event)}\n\n"

            else:
                # Capture rich-media payloads so they can be persisted with the message.
                if event_type == "mind_map" and event.get("data"):
                    mind_map_data = event["data"]
                elif event_type == "diagram" and event.get("data"):
                    diagram_data = event["data"]
                elif event_type == "mcp_result" and event.get("data"):
                    mcp_result_data = event["data"]
                elif event_type == "ui_element" and event.get("element_type"):
                    ui_elements_data.append({
                        "element_type": event["element_type"],
                        "data": event.get("data", {}),
                    })
                yield f"data: {json.dumps(event)}\n\n"

    # ── History loading ───────────────────────────────────────────────────────

    async def _load_history(self, conversation_id: UUID) -> list[dict]:
        from app.agents.memory import get_conversation_summary, RAW_HISTORY_WINDOW

        summary_text = await get_conversation_summary(conversation_id, self.db)

        if summary_text:
            result = await self.db.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.created_at.desc(), Message.role.asc())
                .limit(RAW_HISTORY_WINDOW)
            )
            recent = list(reversed(result.scalars().all()))
            history: list[dict] = [
                {
                    "role": "system",
                    "content": (
                        "【对话历史摘要】以下是本次会话较早期的对话压缩摘要，"
                        "请结合它理解用户的研究背景和上下文：\n\n" + summary_text
                    ),
                }
            ]
            history.extend({"role": m.role, "content": m.content} for m in recent)
            return history

        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc(), Message.role.desc())
            .limit(20)
        )
        return [{"role": m.role, "content": m.content} for m in result.scalars().all()]

    # ── Post-chat background tasks ────────────────────────────────────────────

    def _dispatch_post_chat_tasks(
        self,
        conversation_id: UUID,
        scene: str,
        user_memories: list[dict],
    ) -> None:
        asyncio.create_task(self._extract_memories_safe(conversation_id))
        asyncio.create_task(self._reflect_safe(conversation_id, scene, user_memories))
        asyncio.create_task(self._compress_safe(conversation_id))
        asyncio.create_task(self._maybe_flush_diary(conversation_id))

        from app.config import settings
        if settings.memory_evaluation_sample_rate > 0 and random.random() < settings.memory_evaluation_sample_rate:
            asyncio.create_task(self._evaluate_safe(conversation_id))

    async def _extract_memories_safe(self, conversation_id: UUID) -> None:
        from app.agents.memory import extract_memories
        from app.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as session:
                await extract_memories(conversation_id, self.user_id, session)
                await session.commit()
        except Exception as exc:
            logger.warning("Memory extraction error: %s", exc)

    async def _reflect_safe(
        self, conversation_id: UUID, scene: str, memory_context: list[dict]
    ) -> None:
        from app.agents.research.reflection import reflect_on_conversation
        from app.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as session:
                await reflect_on_conversation(
                    conversation_id, self.user_id, scene, memory_context, session
                )
                await session.commit()
        except Exception as exc:
            logger.warning("Reflection error: %s", exc)

    async def _compress_safe(self, conversation_id: UUID) -> None:
        from app.agents.memory import compress_conversation
        from app.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as session:
                compressed = await compress_conversation(conversation_id, session)
                if compressed:
                    await session.commit()
        except Exception as exc:
            logger.warning("Compression error: %s", exc)

    async def _maybe_flush_diary(self, conversation_id: UUID) -> None:
        from app.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Message).where(Message.conversation_id == conversation_id)
                )
                msg_count = len(result.scalars().all())
            if msg_count >= MEMORY_FLUSH_THRESHOLD:
                from app.workers.tasks import flush_conversation_to_diary
                flush_conversation_to_diary.delay(str(conversation_id))

                from app.config import settings
                if settings.memory_mode == "desktop":
                    from datetime import datetime, timezone
                    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                    asyncio.create_task(self._sync_diary_safe(today))
        except Exception as exc:
            logger.warning("Diary flush error: %s", exc)

    async def _sync_diary_safe(self, date_str: str) -> None:
        from app.agents.memory.file_storage import sync_diary_to_db
        from app.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as session:
                synced = await sync_diary_to_db(self.user_id, date_str, session)
                if synced:
                    await session.commit()
        except Exception as exc:
            logger.warning("Diary sync error: %s", exc)

    async def _evaluate_safe(self, conversation_id: UUID) -> None:
        from app.agents.research.evaluation import evaluate_conversation
        from app.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as session:
                await evaluate_conversation(conversation_id, self.user_id, session)
                await session.commit()
        except Exception as exc:
            logger.warning("Evaluation error: %s", exc)

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _assert_notebook_owner(self, notebook_id: UUID) -> None:
        result = await self.db.execute(
            select(Notebook).where(
                Notebook.id == notebook_id, Notebook.user_id == self.user_id
            )
        )
        if result.scalar_one_or_none() is None:
            raise NotFoundError("笔记本不存在")

    async def _get_owned(self, conversation_id: UUID) -> Conversation:
        # Direct ownership check — avoids JOIN breaking when notebook_id IS NULL
        result = await self.db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == self.user_id,
            )
        )
        conv = result.scalar_one_or_none()
        if conv is None:
            raise NotFoundError("对话不存在")
        return conv
