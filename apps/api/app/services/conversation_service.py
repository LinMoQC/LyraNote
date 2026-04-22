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

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models import Conversation, Message, MessageGeneration, Notebook
from app.trace import get_trace_id
from app.utils.async_tasks import create_logged_task

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


async def _load_user_memories_safely(
    *args,
    **kwargs,
):
    raise RuntimeError("_load_user_memories_safely has been replaced by _load_prompt_context_safely")


async def _load_prompt_context_safely(
    db: AsyncSession,
    user_id: UUID,
    *,
    current_query: str,
    scene: str = "chat",
    notebook_id: UUID | None = None,
    conversation_id: UUID | None = None,
    include_portrait: bool = False,
):
    """
    Load the prompt context bundle behind a savepoint so memory sync / retrieval
    failures do not abort the outer conversation transaction.
    """
    from app.agents.memory import build_prompt_context_bundle, load_prompt_context

    try:
        async with db.begin_nested():
            return await load_prompt_context(
                user_id=user_id,
                query=current_query,
                db=db,
                scene=scene,
                notebook_id=notebook_id,
                conversation_id=conversation_id,
                include_portrait=include_portrait,
            )
    except Exception as exc:
        logger.warning("load_prompt_context failed: %s", exc)
        return build_prompt_context_bundle(scene=scene)


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

        prompt_context = await _load_prompt_context_safely(
            self.db,
            self.user_id,
            current_query=content,
            scene="chat",
            notebook_id=conv.notebook_id,
            conversation_id=conv.id,
            include_portrait=False,
        )
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
            prompt_context=prompt_context,
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
        """Compatibility streaming endpoint backed by durable chat generation."""
        generation = await self.start_message_generation(
            conversation_id,
            content,
            global_search=global_search,
            tool_hint=tool_hint,
            attachment_ids=attachment_ids,
            attachments_meta=attachments_meta,
            thinking_enabled=thinking_enabled,
        )
        async for line in self.subscribe_message_generation(generation["generation_id"], from_index=0):
            yield line

    async def start_message_generation(
        self,
        conversation_id: UUID,
        content: str,
        *,
        global_search: bool = False,
        tool_hint: str | None = None,
        attachment_ids: list[str] | None = None,
        attachments_meta: list[dict] | None = None,
        thinking_enabled: bool | None = None,
    ) -> dict[str, UUID]:
        """Create a durable chat generation and kick off background execution."""
        from app.agents.chat import start_message_generation_task
        from app.config import settings

        await self._get_owned(conversation_id)

        user_msg = Message(
            conversation_id=conversation_id,
            role="user",
            status="completed",
            content=content,
            attachments=attachments_meta,
        )
        assistant_msg = Message(
            conversation_id=conversation_id,
            role="assistant",
            status="streaming",
            content="",
        )
        self.db.add(user_msg)
        self.db.add(assistant_msg)
        await self.db.flush()

        generation = MessageGeneration(
            conversation_id=conversation_id,
            user_message_id=user_msg.id,
            assistant_message_id=assistant_msg.id,
            user_id=self.user_id,
            status="running",
            model=settings.llm_model,
        )
        self.db.add(generation)
        await self.db.flush()

        assistant_msg.generation_id = generation.id
        await self.db.commit()

        start_message_generation_task(
            str(generation.id),
            content=content,
            global_search=global_search,
            tool_hint=tool_hint,
            attachment_ids=attachment_ids,
            thinking_enabled=thinking_enabled,
            trace_id=get_trace_id(),
        )

        return {
            "generation_id": generation.id,
            "conversation_id": conversation_id,
            "user_message_id": user_msg.id,
            "assistant_message_id": assistant_msg.id,
        }

    async def get_message_generation_status(self, generation_id: UUID) -> dict:
        generation = await self._get_owned_generation(generation_id)
        assistant_message = await self.db.get(Message, generation.assistant_message_id)
        return {
            "generation_id": generation.id,
            "conversation_id": generation.conversation_id,
            "user_message_id": generation.user_message_id,
            "assistant_message_id": generation.assistant_message_id,
            "status": generation.status,
            "model": generation.model,
            "error_message": generation.error_message,
            "last_event_index": generation.last_event_index,
            "assistant_message": assistant_message,
            "created_at": generation.started_at,
            "completed_at": generation.completed_at,
        }

    async def subscribe_message_generation(
        self,
        generation_id: UUID,
        *,
        from_index: int = 0,
    ) -> AsyncGenerator[str, None]:
        """Stream durable generation events with DB replay fallback."""
        from app.agents.chat import get_generation_buffer, load_generation_events

        generation = await self._get_owned_generation(generation_id)
        persisted_events = await load_generation_events(generation.id, from_index=from_index)
        buf = get_generation_buffer(str(generation.id))
        terminal = generation.status in {"done", "error", "cancelled"}

        async def _replay_then_follow() -> AsyncGenerator[str, None]:
            next_index = from_index
            for event in persisted_events:
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                next_index = max(next_index, int(event.get("event_index", next_index - 1)) + 1)

            if buf is None:
                yield "data: [DONE]\n\n"
                return

            async for event in buf.subscribe(from_index=next_index):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        if buf is None and not terminal and not persisted_events:
            raise NotFoundError("消息生成缓冲已失效")

        async for line in _replay_then_follow():
            yield line

    # ── History loading ───────────────────────────────────────────────────────

    async def _load_history(self, conversation_id: UUID) -> list[dict]:
        from app.agents.memory import get_conversation_summary, RAW_HISTORY_WINDOW

        summary_text = await get_conversation_summary(conversation_id, self.db)
        limit = RAW_HISTORY_WINDOW if summary_text else 20

        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .where(or_(Message.status != "streaming", Message.content != ""))
            .order_by(Message.created_at.desc(), Message.role.asc())
            .limit(limit)
        )
        recent = list(reversed(result.scalars().all()))
        return [{"role": m.role, "content": m.content} for m in recent]

    # ── Post-chat background tasks ────────────────────────────────────────────

    def _dispatch_post_chat_tasks(
        self,
        conversation_id: UUID,
        scene: str,
        user_memories: list[dict],
    ) -> None:
        create_logged_task(
            self._extract_memories_safe(conversation_id),
            logger=logger,
            description=f"extract memories for conversation {conversation_id}",
        )
        create_logged_task(
            self._reflect_safe(conversation_id, scene, user_memories),
            logger=logger,
            description=f"reflect on conversation {conversation_id}",
        )
        create_logged_task(
            self._compress_safe(conversation_id),
            logger=logger,
            description=f"compress conversation {conversation_id}",
        )
        create_logged_task(
            self._maybe_flush_diary(conversation_id),
            logger=logger,
            description=f"maybe flush diary for conversation {conversation_id}",
        )

        from app.config import settings
        if settings.memory_evaluation_sample_rate > 0 and random.random() < settings.memory_evaluation_sample_rate:
            create_logged_task(
                self._evaluate_safe(conversation_id),
                logger=logger,
                description=f"evaluate memories for conversation {conversation_id}",
            )

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
        except Exception as exc:
            logger.warning("Diary flush error: %s", exc)

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

    async def _get_owned_generation(self, generation_id: UUID) -> MessageGeneration:
        result = await self.db.execute(
            select(MessageGeneration).where(
                MessageGeneration.id == generation_id,
                MessageGeneration.user_id == self.user_id,
            )
        )
        generation = result.scalar_one_or_none()
        if generation is None:
            raise NotFoundError("消息生成不存在")
        return generation
