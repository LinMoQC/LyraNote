"""
Background task manager for durable chat generations.

Decouples normal chat agent execution from client SSE connections so that:
  - message generation survives page refresh / navigation
  - buffered events can be replayed from memory or DB
  - assistant message state is incrementally persisted while streaming
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Conversation, Message, MessageGeneration, MessageGenerationEvent, ObservabilityRun
from app.services.monitoring_service import (
    bind_trace_and_run,
    build_text_snapshot,
    create_observability_run,
    finish_observability_run,
    reset_trace_and_run,
    summarize_run_details,
    traced_span,
    update_observability_run,
)

logger = logging.getLogger(__name__)

_FLUSH_INTERVAL_SECONDS = 0.4
_TOKEN_FLUSH_THRESHOLD = 24


def _snapshot_list(items: list[dict]) -> list[dict] | None:
    """Return a fresh list copy so SQLAlchemy marks JSON columns dirty."""
    if not items:
        return None
    return [dict(item) for item in items]


class GenerationBuffer:
    """Thread-safe in-memory buffer for generation events."""

    def __init__(self) -> None:
        self.events: list[dict] = []
        self.done = False
        self._cond = asyncio.Condition()

    async def push(self, event: dict) -> None:
        async with self._cond:
            self.events.append(event)
            self._cond.notify_all()

    async def mark_done(self) -> None:
        async with self._cond:
            self.done = True
            self._cond.notify_all()

    async def subscribe(self, from_index: int = 0) -> AsyncGenerator[dict, None]:
        idx = from_index
        while True:
            next_event: dict | None = None
            async with self._cond:
                while idx >= len(self.events) and not self.done:
                    await self._cond.wait()

                if idx < len(self.events):
                    next_event = self.events[idx]
                    idx += 1
                elif self.done:
                    return

            if next_event is not None:
                yield next_event


_buffers: dict[str, GenerationBuffer] = {}
_tasks: dict[str, asyncio.Task[None]] = {}


def get_generation_buffer(generation_id: str) -> GenerationBuffer | None:
    return _buffers.get(generation_id)


def get_generation_task(generation_id: str) -> asyncio.Task[None] | None:
    return _tasks.get(generation_id)


async def load_generation_events(generation_id: UUID, from_index: int = 0) -> list[dict]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(MessageGenerationEvent)
            .where(
                MessageGenerationEvent.generation_id == generation_id,
                MessageGenerationEvent.event_index >= from_index,
            )
            .order_by(MessageGenerationEvent.event_index.asc())
        )
        return [row.payload for row in result.scalars().all()]


async def run_message_generation(
    generation_id: str,
    *,
    content: str,
    global_search: bool,
    tool_hint: str | None,
    attachment_ids: list[str] | None,
    thinking_enabled: bool | None,
    trace_id: str | None,
) -> None:
    """Run the normal chat agent in the background and persist streaming progress."""
    from app.agents.core.react_agent import (
        classify_agent_execution_route,
        run_agent,
    )
    from app.services.conversation_service import (
        ConversationService,
        _extract_genui_from_content,
        _load_prompt_context_safely,
    )

    buf = GenerationBuffer()
    _buffers[generation_id] = buf
    trace_token = None
    run_token = None
    run = None

    try:
        generation_uuid = UUID(generation_id)
        async with AsyncSessionLocal() as db:
            generation = await db.get(MessageGeneration, generation_uuid)
            if generation is None:
                raise RuntimeError(f"Message generation {generation_id} not found")

            conversation = await db.get(Conversation, generation.conversation_id)
            if conversation is None:
                raise RuntimeError(f"Conversation {generation.conversation_id} not found")

            assistant_message = await db.get(Message, generation.assistant_message_id)
            if assistant_message is None:
                raise RuntimeError(f"Assistant message {generation.assistant_message_id} not found")

            user_id = generation.user_id
            service = ConversationService(db, user_id)
            run = await create_observability_run(
                db,
                trace_id=trace_id or generation_id,
                run_type="chat_generation",
                name="chat.generation",
                status="running",
                user_id=user_id,
                conversation_id=conversation.id,
                generation_id=generation.id,
                notebook_id=conversation.notebook_id,
                metadata={
                    "query_snapshot": build_text_snapshot(content),
                    "global_search": global_search,
                    "tool_hint": tool_hint,
                    "thinking_enabled": thinking_enabled,
                },
            )
            trace_token, run_token = bind_trace_and_run(trace_id or generation_id, run.id)

            async with traced_span(db, "chat.history_load", run=run):
                history = await service._load_history(conversation.id)

            execution_route = classify_agent_execution_route(
                query=content,
                attachment_ids=attachment_ids,
                tool_hint=tool_hint,
            )
            scene = "research" if execution_route.mode == "multi" else "chat"
            async with traced_span(db, "chat.memory_load", run=run):
                prompt_context = await _load_prompt_context_safely(
                    db,
                    user_id,
                    current_query=content,
                    scene=scene,
                    notebook_id=conversation.notebook_id,
                    conversation_id=conversation.id,
                    include_portrait=execution_route.mode == "multi",
                )
            await update_observability_run(
                db,
                run,
                metadata={
                    "model": generation.model,
                    "history_turn_count": len(history),
                    "memory_count": len(prompt_context.all_memories),
                    "attachment_count": len(attachment_ids or []),
                    "scene": scene,
                },
            )

            full_content: list[str] = []
            full_reasoning: list[str] = []
            citations: list[dict] = []
            agent_steps: list[dict] = []
            speed_metrics: dict | None = None
            mind_map_data: dict | None = None
            diagram_data: dict | None = None
            mcp_result_data: dict | None = None
            ui_elements_data: list[dict] = []
            next_event_index = generation.last_event_index + 1
            token_since_flush = 0
            last_flush_at = time.monotonic()
            tool_call_count = 0
            policy_trace: list[dict] = []
            execution_path = "direct_answer"

            async def _persist_event(event: dict) -> None:
                nonlocal next_event_index
                event_with_index = {**event, "event_index": next_event_index}
                db.add(MessageGenerationEvent(
                    generation_id=generation_uuid,
                    event_index=next_event_index,
                    event_type=event_with_index["type"],
                    payload=event_with_index,
                ))
                generation.last_event_index = next_event_index
                next_event_index += 1
                await buf.push(event_with_index)

            async def _flush_progress(*, force: bool = False) -> None:
                nonlocal token_since_flush, last_flush_at
                should_flush = force or (
                    token_since_flush >= _TOKEN_FLUSH_THRESHOLD
                    or (time.monotonic() - last_flush_at) >= _FLUSH_INTERVAL_SECONDS
                )
                if not should_flush:
                    return

                assistant_message.content = "".join(full_content)
                assistant_message.reasoning = "".join(full_reasoning).strip() or None
                assistant_message.citations = citations or None
                assistant_message.agent_steps = _snapshot_list(agent_steps)
                assistant_message.speed = speed_metrics
                assistant_message.mind_map = mind_map_data
                assistant_message.diagram = diagram_data
                assistant_message.mcp_result = mcp_result_data
                assistant_message.ui_elements = _snapshot_list(ui_elements_data)
                await db.commit()
                token_since_flush = 0
                last_flush_at = time.monotonic()

            async with traced_span(db, "chat.agent.execute", run=run):
                async for event in run_agent(
                    query=content,
                    notebook_id=str(conversation.notebook_id) if conversation.notebook_id else None,
                    user_id=user_id,
                    history=history,
                    db=db,
                    prompt_context=prompt_context,
                    global_search=True if conversation.notebook_id is None else global_search,
                    tool_hint=tool_hint,
                    attachment_ids=attachment_ids,
                    thinking_enabled=thinking_enabled,
                ):
                    event_type = event.get("type")

                    if event_type == "token":
                        full_content.append(event["content"])
                        token_since_flush += 1
                        await _persist_event(event)
                        await _flush_progress()
                        continue

                    if event_type == "citations":
                        citations = event["citations"]
                        await _persist_event(event)
                        await _flush_progress(force=True)
                        continue

                    if event_type in {"thought", "tool_call", "tool_result"}:
                        if event_type == "tool_call":
                            tool_call_count += 1
                        step: dict = {
                            "type": event_type,
                            "content": event.get("content"),
                            "tool": event.get("tool"),
                            "input": event.get("input"),
                        }
                        if event.get("is_system"):
                            step["is_system"] = True
                        agent_steps.append(step)
                        await _persist_event(event)
                        await _flush_progress(force=True)
                        continue


                    if event_type == "content_replace":
                        replaced = event.get("content", "")
                        if isinstance(replaced, str) and replaced:
                            full_content.clear()
                            full_content.append(replaced)
                            await _persist_event(event)
                        continue

                    if event_type == "agent_trace":
                        policy_trace.append({
                            "event": str(event.get("event") or ""),
                            "reason": str(event.get("reason") or ""),
                            "detail": str(event.get("detail") or ""),
                        })
                        await _persist_event(event)
                        continue

                    if event_type == "reasoning":
                        chunk = event.get("content")
                        if chunk:
                            full_reasoning.append(chunk)
                        await _persist_event(event)
                        await _flush_progress()
                        continue

                    if event_type == "error":
                        error_content = event.get("content", "")
                        if error_content:
                            full_content.append(error_content)
                        await _persist_event(event)
                        await _flush_progress(force=True)
                        continue

                    if event_type == "speed":
                        speed_metrics = {
                            "ttft_ms": event.get("ttft_ms", 0),
                            "tps": event.get("tps", 0),
                            "tokens": event.get("tokens", 0),
                        }
                        await _persist_event(event)
                        await _flush_progress(force=True)
                        continue

                    if event_type == "mind_map" and event.get("data"):
                        mind_map_data = event["data"]
                        await _persist_event(event)
                        await _flush_progress(force=True)
                        continue

                    if event_type == "diagram" and event.get("data"):
                        diagram_data = event["data"]
                        await _persist_event(event)
                        await _flush_progress(force=True)
                        continue

                    if event_type == "mcp_result" and event.get("data"):
                        mcp_result_data = event["data"]
                        await _persist_event(event)
                        await _flush_progress(force=True)
                        continue

                    if event_type == "ui_element" and event.get("element_type"):
                        ui_elements_data.append({
                            "element_type": event["element_type"],
                            "data": event.get("data", {}),
                        })
                        await _persist_event(event)
                        await _flush_progress(force=True)
                        continue

                    if event_type == "done":
                        async with traced_span(db, "chat.persist.finalize", run=run):
                            content_text = "".join(full_content)
                            reasoning_text = "".join(full_reasoning).strip() or None
                            if mcp_result_data is None:
                                content_text, extracted_mcp = _extract_genui_from_content(content_text)
                                if extracted_mcp:
                                    mcp_result_data = extracted_mcp
                                    await _persist_event({"type": "mcp_result", "data": extracted_mcp})
                                    await _persist_event({"type": "content_replace", "content": content_text})

                            assistant_message.content = content_text
                            assistant_message.reasoning = reasoning_text
                            assistant_message.citations = citations or None
                            assistant_message.agent_steps = _snapshot_list(agent_steps)
                            assistant_message.speed = speed_metrics
                            assistant_message.mind_map = mind_map_data
                            assistant_message.diagram = diagram_data
                            assistant_message.mcp_result = mcp_result_data
                            assistant_message.ui_elements = _snapshot_list(ui_elements_data)
                            assistant_message.status = "completed"
                            generation.status = "done"
                            generation.completed_at = datetime.now(timezone.utc)
                            # Commit message data BEFORE pushing the done event to the SSE
                            # buffer. The frontend calls getMessages immediately on receiving
                            # done, so the DB must be consistent at that point or the
                            # reasoning/agent_steps fields will read as null.
                            await db.commit()
                            await _persist_event({
                                **event,
                                "message_id": str(assistant_message.id),
                            })
                            detail_summary = await summarize_run_details(db, run.id)
                            await finish_observability_run(
                                db,
                                run,
                                status="done",
                                metadata={
                                    **detail_summary,
                                    "tool_call_count": tool_call_count,
                                    "scene": scene,
                                    "citations_count": len(citations),
                                    "execution_path": execution_path,
                                    "policy_trace": policy_trace,
                                    "query_snapshot": build_text_snapshot(content),
                                    "final_answer_snapshot": build_text_snapshot(content_text),
                                    "reasoning_snapshot": build_text_snapshot(reasoning_text or ""),
                                    "verification_triggered": any(
                                        str(step.get("content") or "").startswith("✅ 正在核对")
                                        for step in agent_steps
                                        if step.get("type") == "thought"
                                    ),
                                },
                            )
                            await db.commit()

                        service._dispatch_post_chat_tasks(
                            conversation.id,
                            scene,
                            prompt_context.all_memories,
                        )
                        break

                    await _persist_event(event)

    except Exception as exc:
        logger.exception("Message generation %s failed", generation_id)
        error_event = {
            "type": "error",
            "content": str(exc),
        }
        try:
            async with AsyncSessionLocal() as db:
                generation_uuid = UUID(generation_id)
                generation = await db.get(MessageGeneration, generation_uuid)
                if generation is not None:
                    assistant_message = await db.get(Message, generation.assistant_message_id)
                    event_index = generation.last_event_index + 1
                    event_with_index = {**error_event, "event_index": event_index}
                    db.add(MessageGenerationEvent(
                        generation_id=generation_uuid,
                        event_index=event_index,
                        event_type="error",
                        payload=event_with_index,
                    ))
                    generation.last_event_index = event_index
                    generation.status = "error"
                    generation.error_message = str(exc)[:2000]
                    generation.completed_at = datetime.now(timezone.utc)
                    if assistant_message is not None:
                        assistant_message.content = assistant_message.content or str(exc)
                        assistant_message.status = "error"
                    result = await db.execute(
                        select(ObservabilityRun)
                        .where(ObservabilityRun.generation_id == generation_uuid)
                        .order_by(ObservabilityRun.started_at.desc())
                        .limit(1)
                    )
                    run = result.scalar_one_or_none()
                    if run is not None:
                        detail_summary = await summarize_run_details(db, run.id)
                        await finish_observability_run(
                            db,
                            run,
                            status="error",
                            metadata={
                                **detail_summary,
                                "query_snapshot": build_text_snapshot(content),
                                "final_answer_snapshot": build_text_snapshot(assistant_message.content if assistant_message else str(exc)),
                            },
                            error_message=str(exc),
                        )
                    await db.commit()
                    await buf.push(event_with_index)
        except Exception:
            logger.exception("Failed to persist error state for generation %s", generation_id)
    finally:
        if trace_token is not None and run_token is not None:
            reset_trace_and_run(trace_token, run_token)
        await buf.mark_done()
        _tasks.pop(generation_id, None)
        asyncio.get_event_loop().call_later(600, lambda: _buffers.pop(generation_id, None))


def start_message_generation_task(
    generation_id: str,
    *,
    content: str,
    global_search: bool,
    tool_hint: str | None,
    attachment_ids: list[str] | None,
    thinking_enabled: bool | None,
    trace_id: str | None,
) -> asyncio.Task[None]:
    task = asyncio.create_task(
        run_message_generation(
            generation_id,
            content=content,
            global_search=global_search,
            tool_hint=tool_hint,
            attachment_ids=attachment_ids,
            thinking_enabled=thinking_enabled,
            trace_id=trace_id,
        )
    )
    _tasks[generation_id] = task
    return task
