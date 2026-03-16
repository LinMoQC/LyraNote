import asyncio
import json
import logging
import random
from uuid import UUID

from fastapi import APIRouter, Query, status

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.exceptions import NotFoundError
from app.models import Conversation, Message, Notebook
from app.schemas.response import ApiResponse, success
from .schemas import ConversationCreate, ConversationOut, MessageCreate, MessageOut, MessageSave

router = APIRouter(tags=["conversations"])


@router.get("/notebooks/{notebook_id}/conversations", response_model=ApiResponse[list[ConversationOut]])
async def list_conversations(
    notebook_id: UUID,
    db: DbDep,
    current_user: CurrentUser,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    await _assert_owner(db, notebook_id, current_user.id)
    result = await db.execute(
        select(Conversation)
        .where(Conversation.notebook_id == notebook_id)
        .order_by(Conversation.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return success(result.scalars().all())


@router.post(
    "/notebooks/{notebook_id}/conversations",
    response_model=ApiResponse[ConversationOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    notebook_id: UUID, body: ConversationCreate, db: DbDep, current_user: CurrentUser
):
    await _assert_owner(db, notebook_id, current_user.id)
    conv = Conversation(
        notebook_id=notebook_id,
        user_id=current_user.id,
        title=body.title,
    )
    db.add(conv)
    await db.flush()
    await db.refresh(conv)
    return success(conv)


@router.get("/conversations/{conversation_id}/messages", response_model=ApiResponse[list[MessageOut]])
async def list_messages(
    conversation_id: UUID,
    db: DbDep,
    current_user: CurrentUser,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    await _get_owned_conv(db, conversation_id, current_user.id)
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.role.asc())
        .offset(offset)
        .limit(limit)
    )
    # Keep response in chronological order for chat rendering.
    return success(list(reversed(result.scalars().all())))


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=ApiResponse[MessageOut],
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: UUID, body: MessageCreate, db: DbDep, current_user: CurrentUser
):
    """Non-streaming: save user message and return full assistant reply."""
    conv = await _get_owned_conv(db, conversation_id, current_user.id)

    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=body.content,
    )
    db.add(user_msg)
    await db.flush()

    history = await _load_history(db, conversation_id)

    from app.agents.retrieval import retrieve_chunks
    from app.agents.composer import compose_answer
    from app.agents.memory import get_user_memories, get_notebook_summary

    user_memories = await get_user_memories(current_user.id, db)
    notebook_summary = await get_notebook_summary(conv.notebook_id, db)
    chunks = await retrieve_chunks(body.content, str(conv.notebook_id), db)
    answer, citations = await compose_answer(
        body.content, chunks, history,
        user_memories=user_memories,
        notebook_summary=notebook_summary,
    )

    assistant_msg = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=answer,
        citations=citations,
    )
    db.add(assistant_msg)
    await db.flush()
    await db.refresh(assistant_msg)
    return success(assistant_msg)


@router.post(
    "/conversations/{conversation_id}/messages/save",
    response_model=ApiResponse[MessageOut],
    status_code=status.HTTP_201_CREATED,
)
async def save_message(
    conversation_id: UUID,
    body: MessageSave,
    db: DbDep,
    current_user: CurrentUser,
):
    """Persist a pre-generated message (e.g. deep research report) without triggering AI."""
    await _get_owned_conv(db, conversation_id, current_user.id)
    msg = Message(
        conversation_id=conversation_id,
        role=body.role,
        content=body.content,
        citations=body.citations,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return success(msg)


@router.post("/conversations/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: UUID,
    body: MessageCreate,
    db: DbDep,
    current_user: CurrentUser,
):
    """SSE streaming via ReAct Agent with L2-L5 memory architecture."""
    conv = await _get_owned_conv(db, conversation_id, current_user.id)

    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=body.content,
        attachments=[a.model_dump() for a in body.attachments_meta] if body.attachments_meta else None,
    )
    db.add(user_msg)
    await db.flush()

    history = await _load_history(db, conversation_id)

    from app.agents.react_agent import run_agent
    from app.agents.memory import build_memory_context, get_notebook_summary
    from app.agents.scene_detector import detect_scene, get_scene_instruction

    # L4: detect scene before building context (non-blocking, defaults to "research" on error)
    scene = await detect_scene(body.content)

    # L2/L3: context-aware Top-K memory injection (isolated try/except to protect the main session)
    try:
        user_memories = await build_memory_context(
            current_user.id, body.content, db, top_k=5, scene=scene
        )
    except Exception as exc:
        logger.warning("build_memory_context failed, proceeding without memories: %s", exc)
        user_memories = []
    notebook_summary = await get_notebook_summary(conv.notebook_id, db)

    # L4: attach scene instruction into memories for system prompt building
    scene_instruction = get_scene_instruction(scene)

    # global_search: search across ALL user notebooks (true for global chat,
    # false for notebook-scoped copilot). Controlled by the frontend.
    is_global_notebook = body.global_search

    async def event_generator():
        full_content: list[str] = []
        citations: list[dict] = []
        agent_steps: list[dict] = []

        async for event in run_agent(
            query=body.content,
            notebook_id=str(conv.notebook_id),
            user_id=current_user.id,
            history=history,
            db=db,
            user_memories=user_memories,
            notebook_summary=notebook_summary,
            scene_instruction=scene_instruction,
            global_search=is_global_notebook,
            tool_hint=body.tool_hint,
            attachment_ids=body.attachment_ids,
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

            elif event_type == "done":
                assistant_msg = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content="".join(full_content),
                    citations=citations,
                    agent_steps=agent_steps or None,
                )
                db.add(assistant_msg)
                await db.flush()

                # Fire-and-forget: memory extraction (L2/L3) + reflection (L5) + compression in parallel
                asyncio.create_task(
                    _extract_memories_safe(conversation_id, current_user.id)
                )
                asyncio.create_task(
                    _reflect_safe(conversation_id, current_user.id, scene, user_memories)
                )
                asyncio.create_task(
                    _compress_conversation_safe(conversation_id)
                )
                # Diary flush: write conversation summary to AI memory notebook
                # when message count crosses MEMORY_FLUSH_THRESHOLD
                asyncio.create_task(
                    _maybe_flush_diary(conversation_id, current_user.id)
                )
                # Evaluation agent: sampled async quality scoring
                from app.config import settings
                if settings.memory_evaluation_sample_rate > 0 and random.random() < settings.memory_evaluation_sample_rate:
                    asyncio.create_task(
                        _evaluate_conversation_safe(conversation_id, current_user.id)
                    )

                event = {**event, "message_id": str(assistant_msg.id)}
                yield f"data: {json.dumps(event)}\n\n"

            else:
                # thought / tool_call / tool_result — pass through to frontend
                yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: UUID, db: DbDep, current_user: CurrentUser):
    conv = await _get_owned_conv(db, conversation_id, current_user.id)
    await db.delete(conv)


async def _extract_memories_safe(conversation_id: UUID, user_id: UUID) -> None:
    """Fire-and-forget memory extraction with its own DB session."""
    from app.agents.memory import extract_memories
    from app.database import AsyncSessionLocal
    import logging
    try:
        async with AsyncSessionLocal() as session:
            await extract_memories(conversation_id, user_id, session)
            await session.commit()
    except Exception as exc:
        logging.getLogger(__name__).warning("Memory extraction error: %s", exc)


async def _reflect_safe(
    conversation_id: UUID,
    user_id: UUID,
    scene: str,
    memory_context: list[dict],
) -> None:
    """Fire-and-forget L5 reflection with its own DB session."""
    from app.agents.reflection import reflect_on_conversation
    from app.database import AsyncSessionLocal
    import logging
    try:
        async with AsyncSessionLocal() as session:
            await reflect_on_conversation(conversation_id, user_id, scene, memory_context, session)
            await session.commit()
    except Exception as exc:
        logging.getLogger(__name__).warning("Reflection error: %s", exc)


async def _compress_conversation_safe(conversation_id: UUID) -> None:
    """
    Fire-and-forget conversation compression with its own DB session.
    Only runs if message count exceeds COMPRESS_TRIGGER (default 20).
    """
    from app.agents.memory import compress_conversation
    from app.database import AsyncSessionLocal
    import logging
    try:
        async with AsyncSessionLocal() as session:
            compressed = await compress_conversation(conversation_id, session)
            if compressed:
                await session.commit()
    except Exception as exc:
        logging.getLogger(__name__).warning("Conversation compression error: %s", exc)


# Number of messages that trigger a diary flush (user + assistant)
MEMORY_FLUSH_THRESHOLD = 20


async def _maybe_flush_diary(conversation_id: UUID, user_id: UUID) -> None:
    """
    Fire-and-forget diary flush: dispatch Celery task if message count ≥ threshold.
    In desktop mode, also syncs the resulting diary file back to DB.
    """
    from app.database import AsyncSessionLocal
    from app.models import Message
    import logging

    log = logging.getLogger(__name__)
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Message).where(Message.conversation_id == conversation_id)
            )
            msg_count = len(result.scalars().all())
        if msg_count >= MEMORY_FLUSH_THRESHOLD:
            from app.workers.tasks import flush_conversation_to_diary
            flush_conversation_to_diary.delay(str(conversation_id))
            log.info(
                "Diary flush dispatched for conversation %s (%d messages)",
                conversation_id, msg_count,
            )
            # Desktop mode: sync today's diary back to DB after flush
            from app.config import settings
            if settings.memory_mode == "desktop":
                from datetime import datetime, timezone
                today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                asyncio.create_task(
                    _sync_diary_safe(user_id, today)
                )
    except Exception as exc:
        logging.getLogger(__name__).warning("Diary flush check error: %s", exc)


async def _sync_diary_safe(user_id: UUID, date_str: str) -> None:
    """Fire-and-forget diary → DB sync (desktop mode only)."""
    from app.agents.file_memory import sync_diary_to_db
    from app.database import AsyncSessionLocal
    import logging
    try:
        async with AsyncSessionLocal() as session:
            synced = await sync_diary_to_db(user_id, date_str, session)
            if synced:
                await session.commit()
    except Exception as exc:
        logging.getLogger(__name__).warning("Diary DB sync error: %s", exc)


async def _evaluate_conversation_safe(conversation_id: UUID, user_id: UUID) -> None:
    """
    Fire-and-forget evaluation agent. Scores conversation quality and writes
    to agent_evaluations. Failures are silently logged (never affect main flow).
    """
    from app.agents.evaluation import evaluate_conversation
    from app.database import AsyncSessionLocal
    import logging
    try:
        async with AsyncSessionLocal() as session:
            await evaluate_conversation(conversation_id, user_id, session)
            await session.commit()
    except Exception as exc:
        logging.getLogger(__name__).warning("Evaluation agent error: %s", exc)


async def _assert_owner(db, notebook_id: UUID, user_id) -> None:
    result = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == user_id)
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("笔记本不存在")


async def _get_owned_conv(db, conversation_id: UUID, user_id) -> Conversation:
    result = await db.execute(
        select(Conversation)
        .join(Notebook, Conversation.notebook_id == Notebook.id)
        .where(Conversation.id == conversation_id, Notebook.user_id == user_id)
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        raise NotFoundError("对话不存在")
    return conv


async def _load_history(db, conversation_id: UUID) -> list[dict]:
    """
    Build the message history for the agent.

    If a ConversationSummary exists (rolling compression has run), returns:
      [{"role": "system", "content": "<summary context>"}]  ← compressed older turns
      + last RAW_HISTORY_WINDOW raw messages

    Otherwise returns the last 20 raw messages (pre-compression baseline).
    """
    from app.agents.memory import get_conversation_summary, RAW_HISTORY_WINDOW

    summary_text = await get_conversation_summary(conversation_id, db)

    if summary_text:
        # Load only the recent raw tail (uncompressed window)
        result = await db.execute(
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

    # No summary yet: return last 20 messages as usual
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.role.desc())
        .limit(20)
    )
    return [{"role": m.role, "content": m.content} for m in result.scalars().all()]
