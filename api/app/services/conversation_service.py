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
import random
from collections.abc import AsyncGenerator
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models import Conversation, Message, Notebook

logger = logging.getLogger(__name__)

MEMORY_FLUSH_THRESHOLD = 20


class ConversationService:
    """Conversation domain business logic."""

    def __init__(self, db: AsyncSession, user_id: UUID):
        self.db = db
        self.user_id = user_id

    # ── Conversation CRUD ─────────────────────────────────────────────────────

    async def list_by_notebook(
        self, notebook_id: UUID, *, offset: int = 0, limit: int = 50
    ) -> list[Conversation]:
        await self._assert_notebook_owner(notebook_id)
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.notebook_id == notebook_id)
            .order_by(Conversation.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, notebook_id: UUID, title: str) -> Conversation:
        await self._assert_notebook_owner(notebook_id)
        conv = Conversation(
            notebook_id=notebook_id,
            user_id=self.user_id,
            title=title,
        )
        self.db.add(conv)
        await self.db.flush()
        await self.db.refresh(conv)
        return conv

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
    ) -> Message:
        await self._get_owned(conversation_id)
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            citations=citations,
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

        from app.agents.rag.retrieval import retrieve_chunks
        from app.agents.writing.composer import compose_answer
        from app.agents.memory import get_user_memories, get_notebook_summary

        user_memories = await get_user_memories(self.user_id, self.db)
        notebook_summary = await get_notebook_summary(conv.notebook_id, self.db)
        chunks = await retrieve_chunks(content, str(conv.notebook_id), self.db)
        answer, citations = await compose_answer(
            content, chunks, history,
            user_memories=user_memories,
            notebook_summary=notebook_summary,
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

        scene = await detect_scene(content)

        try:
            user_memories = await build_memory_context(
                self.user_id, content, self.db, top_k=5, scene=scene
            )
        except Exception as exc:
            logger.warning("build_memory_context failed: %s", exc)
            user_memories = []

        notebook_summary = await get_notebook_summary(conv.notebook_id, self.db)
        scene_instruction = get_scene_instruction(scene)

        full_content: list[str] = []
        citations: list[dict] = []
        agent_steps: list[dict] = []

        async for event in run_agent(
            query=content,
            notebook_id=str(conv.notebook_id),
            user_id=self.user_id,
            history=history,
            db=self.db,
            user_memories=user_memories,
            notebook_summary=notebook_summary,
            scene_instruction=scene_instruction,
            global_search=global_search,
            tool_hint=tool_hint,
            attachment_ids=attachment_ids,
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

            elif event_type == "error":
                full_content.append(event.get("content", ""))
                yield f"data: {json.dumps(event)}\n\n"

            elif event_type == "done":
                content_text = "".join(full_content)
                if content_text:
                    assistant_msg = Message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=content_text,
                        citations=citations,
                        agent_steps=agent_steps or None,
                    )
                    self.db.add(assistant_msg)
                    await self.db.flush()

                    self._dispatch_post_chat_tasks(
                        conversation_id, scene, user_memories
                    )

                    event = {**event, "message_id": str(assistant_msg.id)}
                yield f"data: {json.dumps(event)}\n\n"

            else:
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
        result = await self.db.execute(
            select(Conversation)
            .join(Notebook, Conversation.notebook_id == Notebook.id)
            .where(
                Conversation.id == conversation_id,
                Notebook.user_id == self.user_id,
            )
        )
        conv = result.scalar_one_or_none()
        if conv is None:
            raise NotFoundError("对话不存在")
        return conv
