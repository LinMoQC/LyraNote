"""
Memory Retrieval — ANN-powered Top-K injection with scene weights.

Exports:
  build_memory_context()
  get_user_memories()
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.memory.extraction import infer_memory_kind
from app.models import UserMemory

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Temporal decay
# ---------------------------------------------------------------------------

def _apply_temporal_decay(
    score: float,
    updated_at: datetime | None,
    memory_kind: str,
    half_life_days: float = 21.0,
) -> float:
    """
    Apply exponential temporal decay to a memory relevance score.
    Preference/profile/reference memories are evergreen; project_state decays.
    """
    if memory_kind != "project_state" or updated_at is None:
        return score
    age_days = max(0, (datetime.now(timezone.utc) - updated_at).days)
    lambda_ = math.log(2) / half_life_days
    return score * math.exp(-lambda_ * age_days)


def _scene_weight(memory_kind: str, scene: str) -> float:
    """Return a multiplier based on scene–memory_kind affinity."""
    if scene == "research" and memory_kind in {"project_state", "reference"}:
        return 1.3
    if scene == "writing" and memory_kind in {"preference", "profile"}:
        return 1.3
    if scene == "learning" and memory_kind in {"reference", "profile"}:
        return 1.2
    if scene == "review" and memory_kind in {"project_state", "reference"}:
        return 1.15
    return 1.0


def _resolved_memory_kind(memory: UserMemory) -> str:
    kind = (getattr(memory, "memory_kind", "") or "").strip().lower()
    if kind:
        return kind
    return infer_memory_kind(
        memory.key,
        memory.memory_type or "fact",
        ttl_days=None,
        source=memory.source or "conversation",
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _get_pinned_memories(
    user_id: UUID,
    db: AsyncSession,
    min_confidence: float,
) -> list[UserMemory]:
    """Return high-quality memories (reinforced + accessed >= 3 times)."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(UserMemory)
        .where(
            UserMemory.user_id == user_id,
            UserMemory.reinforced_by.is_not(None),
            UserMemory.access_count >= 3,
            UserMemory.confidence >= min_confidence,
            UserMemory.conflict_flag == False,  # noqa: E712
            or_(
                UserMemory.expires_at.is_(None),
                UserMemory.expires_at > now,
            ),
        )
        .order_by(UserMemory.confidence.desc())
        .limit(2)
    )
    return result.scalars().all()


async def _update_access_stats(db: AsyncSession, memories: list[UserMemory]) -> None:
    now = datetime.now(timezone.utc)
    for m in memories:
        m.access_count = (m.access_count or 0) + 1
        m.last_accessed_at = now
    await db.flush()


# ---------------------------------------------------------------------------
# Context-aware memory injection (L2/L3 Top-K) — V3 ANN version
# ---------------------------------------------------------------------------

async def build_memory_context(
    user_id: UUID,
    current_query: str,
    db: AsyncSession,
    top_k: int = 5,
    min_confidence: float = 0.3,
    scene: str = "research",
) -> list[dict]:
    """
    Return Top-K most relevant user memories for the current query.

    V3 strategy:
    - Embeds only the query (O(1) API call instead of O(n)).
    - Uses pgvector ANN cosine-distance index for candidate retrieval.
    - Re-ranks candidates with temporal decay + scene weights + access_count boost.
    - Pins up to 2 high-quality (reinforced + frequently accessed) memories.
    - Falls back to recency ordering when no stored embeddings exist yet.
    - Filters out conflict_flag=True records.
    """
    from app.providers.embedding import embed_query

    actual_top_k = 3 if scene == "review" else top_k

    now = datetime.now(timezone.utc)
    base_filter = [
        UserMemory.user_id == user_id,
        UserMemory.confidence >= min_confidence,
        UserMemory.conflict_flag == False,  # noqa: E712
        or_(
            UserMemory.expires_at.is_(None),
            UserMemory.expires_at > now,
        ),
    ]

    # Always load ALL preference memories (max 6 fixed keys, always cheap)
    pref_result = await db.execute(
        select(UserMemory).where(
            *base_filter,
            or_(
                UserMemory.memory_kind == "preference",
                and_(
                    UserMemory.memory_kind.is_(None),
                    UserMemory.memory_type == "preference",
                ),
            ),
        )
        .order_by(UserMemory.confidence.desc())
    )
    preference_memories: list[UserMemory] = pref_result.scalars().all()

    # ANN search for fact/skill memories only
    fact_candidates: list[UserMemory] = []
    try:
        query_vec = await embed_query(current_query)
        ann_stmt = (
            select(UserMemory)
            .where(
                *base_filter,
                or_(
                    UserMemory.memory_kind.is_(None),
                    UserMemory.memory_kind != "preference",
                ),
                UserMemory.embedding.is_not(None),
            )
            .order_by(UserMemory.embedding.cosine_distance(query_vec))
            .limit(actual_top_k * 3)
        )
        ann_result = await db.execute(ann_stmt)
        fact_candidates = ann_result.scalars().all()
    except Exception as exc:
        logger.warning("ANN search for facts failed, using recency fallback: %s", exc)
        fallback_result = await db.execute(
            select(UserMemory).where(
                *base_filter,
                or_(
                    UserMemory.memory_kind.is_(None),
                    UserMemory.memory_kind != "preference",
                ),
            )
            .order_by(UserMemory.updated_at.desc())
            .limit(actual_top_k)
        )
        fact_candidates = fallback_result.scalars().all()

    def _rerank_score(mem: UserMemory, rank: int) -> float:
        memory_kind = _resolved_memory_kind(mem)
        base = 1.0 / (rank + 1)
        decayed = _apply_temporal_decay(base, mem.updated_at, memory_kind)
        scene_mult = _scene_weight(memory_kind, scene)
        count_boost = 1.0 + 0.1 * math.log(max(1, (mem.access_count or 0) + 1))
        return decayed * scene_mult * count_boost

    scored_facts = sorted(
        [(mem, _rerank_score(mem, i)) for i, mem in enumerate(fact_candidates)],
        key=lambda x: x[1],
        reverse=True,
    )
    top_facts = [mem for mem, _ in scored_facts[:actual_top_k]]

    pref_ids = {m.id for m in preference_memories}
    merged = list(preference_memories) + [m for m in top_facts if m.id not in pref_ids]

    pinned = await _get_pinned_memories(user_id, db, min_confidence)
    merged_ids = {m.id for m in merged}
    extras = [m for m in pinned if m.id not in merged_ids][:2]
    if extras:
        merged = extras + merged

    selected = merged[: actual_top_k + len(preference_memories)]

    await _update_access_stats(db, selected)

    return [
        {
            "key": m.key,
            "value": m.value,
            "confidence": m.confidence,
            "memory_type": m.memory_type,
            "memory_kind": _resolved_memory_kind(m),
            "source": m.source,
        }
        for m in selected
    ]


# ---------------------------------------------------------------------------
# Legacy loader (for non-streaming callers)
# ---------------------------------------------------------------------------

async def get_user_memories(
    user_id: UUID,
    db: AsyncSession,
    min_confidence: float = 0.3,
) -> list[dict]:
    """Return all UserMemory rows with confidence >= min_confidence, newest first."""
    result = await db.execute(
        select(UserMemory)
        .where(
            UserMemory.user_id == user_id,
            UserMemory.confidence >= min_confidence,
            UserMemory.conflict_flag == False,  # noqa: E712
            or_(
                UserMemory.expires_at.is_(None),
                UserMemory.expires_at > datetime.now(timezone.utc),
            ),
        )
        .order_by(UserMemory.updated_at.desc())
    )
    return [
        {
            "key": m.key,
            "value": m.value,
            "confidence": m.confidence,
            "memory_type": m.memory_type,
            "memory_kind": _resolved_memory_kind(m),
            "source": m.source,
        }
        for m in result.scalars().all()
    ]
