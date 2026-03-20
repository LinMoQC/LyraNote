"""
Memory Management API — lets users view, edit, and delete their AI memories.

Endpoints:
  GET    /memory              All memories (grouped by type)
  GET    /memory/reflections  AI self-reflection history (last 30)
  GET    /memory/evaluations  Conversation quality evaluations (last 50)
  PUT    /memory/{id}         Correct a memory value
  DELETE /memory/{id}         Delete a memory entry
  POST   /memory/reset        Delete all memories (GDPR-friendly)
"""

from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.exceptions import BadRequestError, NotFoundError
from app.models import AgentEvaluation, AgentReflection, UserMemory
from app.schemas.response import ApiResponse, success

from .schemas import (
    DiaryEntryOut,
    EvaluationOut,
    MemoryDocOut,
    MemoryDocUpdate,
    MemoryGroupedOut,
    MemoryOut,
    MemoryUpdate,
    ReflectionOut,
)

router = APIRouter(tags=["memory"])


# ---------------------------------------------------------------------------
# Memory Doc endpoints (global evergreen memory — file-based)
# ---------------------------------------------------------------------------

@router.get("/memory/doc", response_model=ApiResponse[MemoryDocOut])
async def get_memory_doc_endpoint(_current_user: CurrentUser) -> ApiResponse[MemoryDocOut]:
    """Return the global AI memory document (read from local file)."""
    from app.agents.memory.file_storage import get_memory_doc_mtime, read_memory_doc
    return success(MemoryDocOut(
        content_md=read_memory_doc(),
        updated_at=get_memory_doc_mtime(),
    ))


@router.patch("/memory/doc", status_code=status.HTTP_204_NO_CONTENT)
async def update_memory_doc_endpoint(
    body: MemoryDocUpdate,
    _current_user: CurrentUser,
) -> None:
    """Overwrite the global AI memory document (write to local file)."""
    import asyncio
    from app.agents.memory.file_storage import write_memory_doc
    await asyncio.to_thread(write_memory_doc, body.content_md)


# ---------------------------------------------------------------------------
# Diary endpoints (file-based daily summaries)
# ---------------------------------------------------------------------------

@router.get("/memory/diary", response_model=ApiResponse[list[dict]])
async def list_diary_notes(_current_user: CurrentUser) -> ApiResponse[list[dict]]:
    """List all diary note files (newest first)."""
    from app.agents.memory.file_storage import list_diary_files
    return success(list_diary_files())


@router.get("/memory/diary/{date}", response_model=ApiResponse[DiaryEntryOut])
async def get_diary_note(date: str, _current_user: CurrentUser) -> ApiResponse[DiaryEntryOut]:
    """Return the content of a specific diary note by date (YYYY-MM-DD)."""
    import re
    from app.agents.memory.file_storage import get_memory_dir

    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        raise BadRequestError("日期格式无效，请使用 YYYY-MM-DD")

    path = get_memory_dir() / "diary" / f"{date}.md"
    if not path.exists():
        raise NotFoundError("日记记录不存在")

    return success(DiaryEntryOut(date=date, content=path.read_text(encoding="utf-8")))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/memory", response_model=ApiResponse[MemoryGroupedOut])
async def list_memories(db: DbDep, current_user: CurrentUser) -> ApiResponse[MemoryGroupedOut]:
    """Return all memories for the current user, grouped by memory_type."""
    result = await db.execute(
        select(UserMemory)
        .where(UserMemory.user_id == current_user.id)
        .order_by(UserMemory.confidence.desc(), UserMemory.updated_at.desc())
    )
    memories = result.scalars().all()

    grouped: dict[str, list[MemoryOut]] = {"preference": [], "fact": [], "skill": []}
    for m in memories:
        mem_type = m.memory_type or "preference"
        entry = MemoryOut(
            id=m.id,
            key=m.key,
            value=m.value,
            confidence=round(m.confidence or 0.5, 2),
            memory_type=mem_type,
            access_count=m.access_count or 0,
            last_accessed_at=m.last_accessed_at.isoformat() if m.last_accessed_at else None,
            expires_at=m.expires_at.isoformat() if m.expires_at else None,
        )
        if mem_type in grouped:
            grouped[mem_type].append(entry)
        else:
            grouped.setdefault(mem_type, []).append(entry)

    return success(MemoryGroupedOut(**grouped))


@router.get("/memory/reflections", response_model=ApiResponse[list[ReflectionOut]])
async def list_reflections(db: DbDep, current_user: CurrentUser) -> ApiResponse[list[ReflectionOut]]:
    """Return the last 30 AI self-reflection records for the current user."""
    result = await db.execute(
        select(AgentReflection)
        .where(AgentReflection.user_id == current_user.id)
        .order_by(AgentReflection.created_at.desc())
        .limit(30)
    )
    reflections = result.scalars().all()
    return success([
        ReflectionOut(
            id=r.id,
            conversation_id=r.conversation_id,
            scene=r.scene,
            quality_score=r.quality_score,
            what_worked=r.what_worked,
            what_failed=r.what_failed,
            memory_reinforced=r.memory_reinforced or [],
            created_at=r.created_at.isoformat(),
        )
        for r in reflections
    ])


@router.get("/memory/evaluations", response_model=ApiResponse[list[EvaluationOut]])
async def list_evaluations(db: DbDep, current_user: CurrentUser) -> ApiResponse[list[EvaluationOut]]:
    """Return the last 50 conversation evaluation records for the current user."""
    result = await db.execute(
        select(AgentEvaluation)
        .where(AgentEvaluation.user_id == current_user.id)
        .order_by(AgentEvaluation.created_at.desc())
        .limit(50)
    )
    evaluations = result.scalars().all()
    return success([
        EvaluationOut(
            id=e.id,
            conversation_id=e.conversation_id,
            overall_score=e.overall_score,
            relevance_score=e.relevance_score,
            evidence_score=e.evidence_score,
            actionability_score=e.actionability_score,
            notes=e.notes,
            created_at=e.created_at.isoformat(),
        )
        for e in evaluations
    ])


@router.put("/memory/{memory_id}", response_model=ApiResponse[MemoryOut])
async def update_memory(
    memory_id: UUID,
    body: MemoryUpdate,
    db: DbDep,
    current_user: CurrentUser,
) -> ApiResponse[MemoryOut]:
    """Allow the user to manually correct a memory value."""
    memory = await _get_owned_memory(db, memory_id, current_user.id)
    memory.value = body.value.strip()
    # User-corrected memories get a confidence boost to 0.95
    memory.confidence = 0.95
    await db.flush()
    return success(MemoryOut(
        id=memory.id,
        key=memory.key,
        value=memory.value,
        confidence=memory.confidence,
        memory_type=memory.memory_type or "preference",
        access_count=memory.access_count or 0,
        last_accessed_at=memory.last_accessed_at.isoformat() if memory.last_accessed_at else None,
        expires_at=memory.expires_at.isoformat() if memory.expires_at else None,
    ))


@router.delete("/memory/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(
    memory_id: UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> None:
    """Delete a specific memory entry."""
    memory = await _get_owned_memory(db, memory_id, current_user.id)
    await db.delete(memory)


@router.post("/memory/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_memories(db: DbDep, current_user: CurrentUser) -> None:
    """Delete ALL memories for the current user (GDPR-friendly reset)."""
    result = await db.execute(
        select(UserMemory).where(UserMemory.user_id == current_user.id)
    )
    for memory in result.scalars().all():
        await db.delete(memory)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

async def _get_owned_memory(db, memory_id: UUID, user_id) -> UserMemory:
    result = await db.execute(
        select(UserMemory).where(
            UserMemory.id == memory_id,
            UserMemory.user_id == user_id,
        )
    )
    memory = result.scalar_one_or_none()
    if memory is None:
        raise NotFoundError("记忆记录不存在")
    return memory
