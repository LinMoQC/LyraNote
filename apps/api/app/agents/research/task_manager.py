"""
Background task manager for deep-research.

Decouples LangGraph execution from client SSE connections so that:
  - Research survives page refresh / navigation
  - Completed results are persisted in DB
  - Clients can reconnect and replay buffered events
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import ResearchTask, Message

logger = logging.getLogger(__name__)


class TaskBuffer:
    """Thread-safe in-memory event buffer with subscriber notification."""

    def __init__(self) -> None:
        self.events: list[dict] = []
        self.done: bool = False
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

            # Yield outside lock so slow subscribers don't block producers.
            if next_event is not None:
                yield next_event


# Module-level registry of active task buffers
_buffers: dict[str, TaskBuffer] = {}


def get_buffer(task_id: str) -> TaskBuffer | None:
    return _buffers.get(task_id)


async def run_research_task(
    task_id: str,
    query: str,
    notebook_id: str | None,
    conversation_id: str | None,
    user_id: str,
    mode: str,
    model: str,
    tavily_api_key: str | None,
    user_memories: list[dict],
    clarification_context: list[dict] | None = None,
) -> None:
    """Background coroutine: run LangGraph, push events to buffer, save to DB."""
    buf = TaskBuffer()
    _buffers[task_id] = buf

    try:
        from app.agents.research.deep_research import create_research_graph
        from app.providers.llm import get_client

        client = get_client()

        async with AsyncSessionLocal() as db:
            graph = create_research_graph(
                db=db,
                client=client,
                tavily_api_key=tavily_api_key,
            )

            input_state = {
                "query": query,
                "notebook_id": notebook_id,
                "user_id": user_id,
                "model": model,
                "tavily_api_key": tavily_api_key,
                "user_memories": user_memories,
                "mode": mode,
                "clarification_context": clarification_context,
                "research_goal": "",
                "evaluation_criteria": [],
                "search_matrix": {},
                "learnings": [],
                "full_report": "",
                "deliverable": None,
            }

            full_report = ""
            deliverable = None
            timeline: dict = {
                "subQuestions": [],
                "learnings": [],
                "doneCitations": [],
                "mode": mode,
            }

            async for event in graph.astream_events(input_state, version="v2"):
                if event["event"] != "on_custom_event":
                    continue

                sse = {"type": event["name"], "data": event["data"]}
                await buf.push(sse)

                etype = event["name"]
                edata = event["data"]

                if etype == "plan":
                    if "sub_questions" in edata:
                        timeline["subQuestions"] = edata.get("sub_questions", [])
                        timeline["researchGoal"] = edata.get("research_goal")
                        timeline["evaluationCriteria"] = edata.get("evaluation_criteria")
                        timeline["reportTitle"] = edata.get("report_title")
                elif etype == "learning":
                    timeline["learnings"].append(edata)
                elif etype == "token":
                    full_report += edata.get("token", "")
                elif etype == "done":
                    timeline["doneCitations"] = edata.get("citations", [])
                elif etype == "deliverable":
                    deliverable = edata

            timeline["deliverable"] = deliverable

            await db.execute(
                update(ResearchTask)
                .where(ResearchTask.id == uuid.UUID(task_id))
                .values(
                    status="done",
                    report=full_report,
                    deliverable_json=deliverable,
                    timeline_json=timeline,
                    completed_at=datetime.now(timezone.utc),
                )
            )

            if conversation_id and full_report:
                assistant_msg = Message(
                    conversation_id=uuid.UUID(conversation_id),
                    role="assistant",
                    content=full_report,
                )
                db.add(assistant_msg)

            await db.commit()

    except Exception as exc:
        logger.exception("Research task %s failed", task_id)
        error_event = {"type": "error", "data": {"message": str(exc)}}
        await buf.push(error_event)

        try:
            async with AsyncSessionLocal() as db:
                await db.execute(
                    update(ResearchTask)
                    .where(ResearchTask.id == uuid.UUID(task_id))
                    .values(
                        status="error",
                        error_message=str(exc)[:2000],
                        completed_at=datetime.now(timezone.utc),
                    )
                )
                await db.commit()
        except Exception:
            logger.exception("Failed to update task status for %s", task_id)
    finally:
        await buf.mark_done()
        # Keep buffer for reconnects; clean up after 10 minutes
        asyncio.get_event_loop().call_later(600, lambda: _buffers.pop(task_id, None))
