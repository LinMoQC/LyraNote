"""
Prompt context bundle loader for chat and research scenes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import AppConfig
from app.services.memory_service import MemoryService

IDENTITY_MEMORY_KEYS = {"preferred_ai_name", "user_role", "communication_tone"}


@dataclass(frozen=True)
class PromptContextBundle:
    scene: str = "chat"
    ai_name: str = "AI 助手"
    identity_memories: list[dict] = field(default_factory=list)
    long_term_memories: list[dict] = field(default_factory=list)
    conversation_summary: str | None = None
    notebook_summary: dict | None = None
    portrait: dict | None = None

    @property
    def all_memories(self) -> list[dict]:
        return [*self.identity_memories, *self.long_term_memories]


def _memory_priority(memory: dict[str, Any]) -> tuple[int, float]:
    source = str(memory.get("source", "")).strip().lower()
    if source == "manual":
        return (0, -float(memory.get("confidence", 0.0) or 0.0))
    if source == "conversation":
        return (1, -float(memory.get("confidence", 0.0) or 0.0))
    if source == "file":
        return (2, -float(memory.get("confidence", 0.0) or 0.0))
    return (3, -float(memory.get("confidence", 0.0) or 0.0))


def dedupe_runtime_memories(memories: list[dict] | None) -> list[dict]:
    items = list(memories or [])
    if not items:
        return []

    chosen_by_pair: dict[tuple[str, str], dict] = {}
    for memory in items:
        key = str(memory.get("key", "")).strip()
        value = str(memory.get("value", "")).strip()
        if not key or not value or key.startswith("diary_"):
            continue
        pair = (key, value)
        existing = chosen_by_pair.get(pair)
        if existing is None or _memory_priority(memory) < _memory_priority(existing):
            chosen_by_pair[pair] = memory

    deduped: list[dict] = []
    seen_pairs: set[tuple[str, str]] = set()
    for memory in items:
        key = str(memory.get("key", "")).strip()
        value = str(memory.get("value", "")).strip()
        pair = (key, value)
        if pair in seen_pairs:
            continue
        chosen = chosen_by_pair.get(pair)
        if chosen is None or chosen is not memory:
            continue
        deduped.append(memory)
        seen_pairs.add(pair)
    return deduped


def build_prompt_context_bundle(
    *,
    scene: str = "chat",
    ai_name: str | None = None,
    user_memories: list[dict] | None = None,
    conversation_summary: str | None = None,
    notebook_summary: dict | None = None,
    portrait: dict | None = None,
) -> PromptContextBundle:
    identity_memories: list[dict] = []
    long_term_memories: list[dict] = []

    for memory in dedupe_runtime_memories(user_memories):
        key = str(memory.get("key", "")).strip()
        if key in IDENTITY_MEMORY_KEYS:
            identity_memories.append(memory)
        else:
            long_term_memories.append(memory)

    resolved_ai_name = (ai_name or "").strip() or "AI 助手"

    return PromptContextBundle(
        scene=scene,
        ai_name=resolved_ai_name,
        identity_memories=identity_memories,
        long_term_memories=long_term_memories,
        conversation_summary=conversation_summary or None,
        notebook_summary=notebook_summary,
        portrait=portrait,
    )


async def load_prompt_context(
    *,
    user_id: UUID,
    query: str,
    db: AsyncSession,
    scene: str = "chat",
    notebook_id: UUID | None = None,
    conversation_id: UUID | None = None,
    include_portrait: bool = False,
    top_k: int = 5,
) -> PromptContextBundle:
    from app.agents.memory.notebook import get_conversation_summary, get_notebook_summary
    from app.agents.memory.retrieval import build_memory_context
    from app.agents.portrait.loader import load_latest_portrait

    memory_service = MemoryService(db, user_id)
    await memory_service.sync_memory_doc_if_stale()
    await memory_service.cleanup_runtime_memories()

    user_memories = await build_memory_context(
        user_id,
        query,
        db,
        top_k=top_k,
        scene=scene,
    )

    conversation_summary = None
    if conversation_id is not None:
        conversation_summary = await get_conversation_summary(conversation_id, db)

    notebook_summary = None
    if notebook_id is not None:
        notebook_summary = await get_notebook_summary(notebook_id, db)

    portrait = None
    if include_portrait:
        portrait = await load_latest_portrait(db, user_id)

    ai_name = await resolve_prompt_config(db)
    return build_prompt_context_bundle(
        scene=scene,
        ai_name=ai_name,
        user_memories=user_memories,
        conversation_summary=conversation_summary,
        notebook_summary=notebook_summary,
        portrait=portrait,
    )


async def resolve_prompt_config(db: AsyncSession) -> str:
    ai_name = (getattr(settings, "ai_name", "") or "").strip()
    if not ai_name:
        result = await db.execute(
            select(AppConfig).where(AppConfig.key == "ai_name")
        )
        row = result.scalar_one_or_none()
        ai_name = (row.value if row else "") or ""

    return ai_name.strip() or "AI 助手"
