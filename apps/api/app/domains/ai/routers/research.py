"""Deep research endpoints — background task architecture.

POST /ai/deep-research          → create task, return { task_id }
GET  /ai/deep-research/{id}/events → SSE stream (supports ?from=N replay)
GET  /ai/deep-research/{id}     → query status + results
"""

import asyncio
import json
import uuid as _uuid
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.domains.ai.schemas import ClarifyRequest, DeepResearchRequest
from app.config import settings
from app.models import ResearchTask, Conversation, Message, Notebook
from app.schemas.response import success
from app.agents.research.task_manager import get_buffer, run_research_task

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/ai/deep-research/clarify")
async def clarify_deep_research(
    body: ClarifyRequest,
    current_user: CurrentUser,
):
    """Generate clarifying questions for a deep-research query."""
    from app.agents.research.deep_research import generate_clarifying_questions
    from app.providers.llm import get_client

    client = get_client()
    questions = await generate_clarifying_questions(body.query, client, settings.llm_model)
    return success({"questions": questions})


@router.post("/ai/deep-research")
async def create_deep_research(
    body: DeepResearchRequest,
    current_user: CurrentUser,
    db: DbDep,
):
    """Create a background deep-research task. Returns immediately."""
    task_id = _uuid.uuid4()
    if not body.notebook_id:
        raise HTTPException(400, "notebook_id is required")
    try:
        nb_id = _uuid.UUID(body.notebook_id)
    except ValueError:
        raise HTTPException(400, "Invalid notebook_id")

    nb_result = await db.execute(
        select(Notebook).where(
            Notebook.id == nb_id,
            Notebook.user_id == current_user.id,
        )
    )
    notebook = nb_result.scalar_one_or_none()
    if notebook is None:
        raise HTTPException(404, "Notebook not found")

    # Create conversation + user message immediately so the sidebar shows it
    conv = Conversation(
        notebook_id=notebook.id,
        user_id=current_user.id,
        title=body.query[:60],
    )
    db.add(conv)
    await db.flush()

    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        content=body.query,
    )
    db.add(user_msg)
    await db.flush()

    task = ResearchTask(
        id=task_id,
        user_id=current_user.id,
        notebook_id=str(notebook.id),
        conversation_id=conv.id,
        query=body.query,
        mode=body.mode,
        status="running",
    )
    db.add(task)
    await db.commit()

    from app.agents.memory import build_memory_context
    try:
        user_memories = await build_memory_context(current_user.id, body.query, db, top_k=5)
    except Exception as exc:
        logger.warning("Memory context load failed: %s", exc)
        user_memories = []

    asyncio.create_task(
        run_research_task(
            task_id=str(task_id),
            query=body.query,
            notebook_id=str(notebook.id),
            conversation_id=str(conv.id),
            user_id=str(current_user.id),
            mode=body.mode,
            model=settings.llm_model,
            tavily_api_key=settings.tavily_api_key or None,
            user_memories=user_memories,
            clarification_context=body.clarification_context,
        )
    )

    return success({
        "task_id": str(task_id),
        "conversation_id": str(conv.id),
    })


@router.get("/ai/deep-research/{task_id}/events")
async def subscribe_deep_research(
    task_id: str,
    current_user: CurrentUser,
    db: DbDep,
    from_index: int = Query(0, alias="from", ge=0),
):
    """Subscribe to SSE events for a running task. Supports ?from=N for replay."""
    try:
        tid = _uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(400, "Invalid task_id")

    result = await db.execute(
        select(ResearchTask).where(
            ResearchTask.id == tid,
            ResearchTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")

    buf = get_buffer(task_id)

    if buf is None and task.status == "done":
        async def replay_done():
            if task.timeline_json:
                tl = task.timeline_json
                plan_event = {
                    "type": "plan",
                    "data": {
                        "sub_questions": tl.get("subQuestions", []),
                        "research_goal": tl.get("researchGoal"),
                        "evaluation_criteria": tl.get("evaluationCriteria"),
                        "report_title": tl.get("reportTitle"),
                    },
                }
                yield f"data: {json.dumps(plan_event, ensure_ascii=False)}\n\n"

                for learning in tl.get("learnings", []):
                    yield f"data: {json.dumps({'type': 'learning', 'data': learning}, ensure_ascii=False)}\n\n"

                yield f"data: {json.dumps({'type': 'writing', 'data': {}}, ensure_ascii=False)}\n\n"

                if task.report:
                    yield f"data: {json.dumps({'type': 'report_complete', 'data': {'report': task.report}}, ensure_ascii=False)}\n\n"

                done_cites = tl.get("doneCitations", [])
                yield f"data: {json.dumps({'type': 'done', 'data': {'citations': done_cites}}, ensure_ascii=False)}\n\n"

                if tl.get("deliverable"):
                    yield f"data: {json.dumps({'type': 'deliverable', 'data': tl['deliverable']}, ensure_ascii=False)}\n\n"

            yield "data: [DONE]\n\n"

        return StreamingResponse(replay_done(), media_type="text/event-stream")

    if buf is None:
        raise HTTPException(410, "Task buffer expired. Use GET /ai/deep-research/{task_id} to fetch results.")

    async def generate():
        async for event in buf.subscribe(from_index=from_index):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/ai/deep-research/{task_id}")
async def get_deep_research_status(
    task_id: str,
    current_user: CurrentUser,
    db: DbDep,
):
    """Query task status and results (for refresh recovery)."""
    try:
        tid = _uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(400, "Invalid task_id")

    result = await db.execute(
        select(ResearchTask).where(
            ResearchTask.id == tid,
            ResearchTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")

    buf = get_buffer(task_id)
    event_count = len(buf.events) if buf else 0

    return success({
        "task_id": str(task.id),
        "conversation_id": str(task.conversation_id) if task.conversation_id else None,
        "status": task.status,
        "query": task.query,
        "mode": task.mode,
        "report": task.report,
        "deliverable": task.deliverable_json,
        "timeline": task.timeline_json,
        "error_message": task.error_message,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "event_count": event_count,
        "buffer_alive": buf is not None,
    })
