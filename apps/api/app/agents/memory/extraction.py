"""
Memory Extraction & Lifecycle — post-conversation extraction, upsert,
reinforcement, and decay.

Exports:
  PREFERENCE_KEYS
  extract_memories()
  _upsert_memory()          (also used by file_memory and skills)
  reinforce_memory()
  mark_memory_stale()
  decay_stale_memories()
"""

from __future__ import annotations

import json
import logging
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Message, UserMemory

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PREFERENCE_KEYS = {
    "writing_style",
    "interest_topic",
    "technical_level",
    "preferred_lang",
    "domain_expertise",
    "output_preference",
    "preferred_ai_name",
    "user_role",
    "communication_tone",
}

MEMORY_KINDS = {"profile", "preference", "project_state", "reference"}

_PROFILE_KEY_HINTS = (
    "profile",
    "background",
    "identity",
    "occupation",
    "profession",
    "role",
    "expertise",
    "experience",
    "bio",
)

_PROJECT_STATE_KEY_HINTS = (
    "active",
    "current",
    "recent",
    "ongoing",
    "working",
    "today",
    "this_",
    "next",
    "project",
    "research",
    "focus",
    "goal",
    "task",
    "plan",
    "topic",
)

_REFERENCE_KEY_HINTS = (
    "url",
    "uri",
    "link",
    "reference",
    "resource",
    "dataset",
    "paper",
    "doc",
    "documentation",
    "repo",
    "repository",
    "source",
    "notion",
    "drive",
)

MEMORY_EXTRACTION_PROMPT = """
分析以下对话，提取关于用户的持久信息。

请同时输出两类信息：

1. **preferences**（稳定偏好，只使用下列固定 key）：
   - writing_style（如：简洁直接 / 详细完整）
   - interest_topic（如：机器学习 / 产品设计）
   - technical_level（如：初学者 / 专家级）
   - preferred_lang（如：中文 / English）
   - domain_expertise（如：软件工程 / 生物医学）
   - output_preference（如：要点列表 / 连贯段落）

2. **facts**（当前状态事实，key 可以自由命名，但要简短有意义）：
   - 如：current_research_topic、known_misconception、active_project、familiar_framework 等
   - 每条 fact 必须标注 memory_kind：
     - profile：较稳定的用户背景、长期身份、知识结构线索
     - project_state：当前阶段任务、研究重心、最近上下文，默认 ttl_days=21
     - reference：外部资料入口、资源位置、以后去哪里找什么，通常不需要 ttl_days
   - 每条 fact 可携带 ttl_days（有效天数）；project_state 默认 21 天，其余通常留空

规则：
- 只提取置信度 > 0.5 的信息，不要猜测
- 不要重复已知信息，只提取新出现的信号
- facts 中不要放稳定偏好类信息（那属于 preferences）
- 不要保存本轮临时任务、待办步骤、对话摘要
- 不要保存能直接从当前笔记内容推导出的普通事实
- reference 应写成“去哪里找什么”的入口描述，不要大段复制原文

以 JSON 格式返回：
{{
  "preferences": [
    {{"key": "...", "value": "...", "confidence": 0.0-1.0}}
  ],
  "facts": [
    {{"key": "...", "value": "...", "memory_kind": "project_state", "confidence": 0.0-1.0, "ttl_days": 21}}
  ]
}}

对话内容：
{conversation}

只返回 JSON，无其他内容。
""".strip()


# ---------------------------------------------------------------------------
# Pydantic schemas for strict LLM output validation
# ---------------------------------------------------------------------------

class _MemoryPreference(BaseModel):
    key: str
    value: str
    confidence: Annotated[float, Field(ge=0.0, le=1.0)] = 0.5


class _MemoryFact(BaseModel):
    key: str
    value: str
    memory_kind: str = "project_state"
    confidence: Annotated[float, Field(ge=0.0, le=1.0)] = 0.5
    ttl_days: int | None = None


class _MemoryExtractionResult(BaseModel):
    preferences: list[_MemoryPreference] = []
    facts: list[_MemoryFact] = []


def normalize_memory_kind(memory_kind: str | None) -> str | None:
    if not memory_kind:
        return None
    normalized = memory_kind.strip().lower()
    return normalized if normalized in MEMORY_KINDS else None


def infer_memory_kind(
    key: str,
    memory_type: str,
    ttl_days: int | None = None,
    source: str = "conversation",
) -> str:
    normalized_type = (memory_type or "").strip().lower()
    normalized_key = (key or "").strip().lower()

    if normalized_type == "preference":
        return "preference"

    if source == "file" and normalized_key.startswith("diary_"):
        return "project_state"

    if any(token in normalized_key for token in _REFERENCE_KEY_HINTS):
        return "reference"

    if ttl_days is not None and ttl_days <= 45:
        return "project_state"

    if any(token in normalized_key for token in _PROJECT_STATE_KEY_HINTS):
        return "project_state"

    if any(token in normalized_key for token in _PROFILE_KEY_HINTS):
        return "profile"

    return "profile"


def default_ttl_days_for_kind(memory_kind: str, ttl_days: int | None) -> int | None:
    if ttl_days is not None:
        return ttl_days
    if memory_kind == "project_state":
        return 21
    return None


# ---------------------------------------------------------------------------
# Memory extraction (post-conversation)
# ---------------------------------------------------------------------------

async def extract_memories(conversation_id: UUID, user_id: UUID, db: AsyncSession) -> None:
    """
    Called async after a conversation turn completes.
    Extracts both preference signals and fact items from the conversation,
    then upserts into user_memories with conflict resolution.
    """
    from app.providers.llm import chat

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .limit(30)
    )
    messages = result.scalars().all()
    if len(messages) < 2:
        return

    message_ids = ",".join(str(m.id) for m in messages)

    conv_text = "\n".join(
        f"{'用户' if m.role == 'user' else 'AI'}: {m.content[:300]}"
        for m in messages
    )

    try:
        raw = await chat(
            [
                {"role": "system", "content": "你是一个用户信息分析助手，只输出 JSON。"},
                {"role": "user", "content": MEMORY_EXTRACTION_PROMPT.format(conversation=conv_text)},
            ],
            temperature=0.2,
        )
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        parsed_dict: dict = json.loads(raw)
        extraction = _MemoryExtractionResult.model_validate(parsed_dict)

    except (json.JSONDecodeError, ValidationError, Exception) as exc:
        logger.warning(
            "Memory extraction parse/validation failed for conversation %s: %s — "
            "skipping structured memory write",
            conversation_id, exc,
        )
        return

    saved = 0

    for item in extraction.preferences:
        key = item.key.strip()
        value = item.value.strip()
        if key not in PREFERENCE_KEYS or not value or item.confidence < 0.4:
            continue
        await _upsert_memory(
            db, user_id, key, value, item.confidence, "preference",
            ttl_days=None,
            memory_kind="preference",
            source="conversation",
            evidence=message_ids,
        )
        saved += 1

    for item in extraction.facts:
        key = item.key.strip().replace(" ", "_")[:80]
        value = item.value.strip()
        if not key or not value or item.confidence < 0.4:
            continue
        await _upsert_memory(
            db, user_id, key, value, item.confidence, "fact",
            ttl_days=item.ttl_days,
            memory_kind=normalize_memory_kind(item.memory_kind),
            source="conversation",
            evidence=message_ids,
        )
        saved += 1

    await db.flush()
    logger.info("Extracted %d memory items for user %s (conversation %s)", saved, user_id, conversation_id)


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

async def _upsert_memory(
    db: AsyncSession,
    user_id: UUID,
    key: str,
    value: str,
    confidence: float,
    memory_type: str,
    ttl_days: int | None,
    memory_kind: str | None = None,
    source: str = "conversation",
    evidence: str | None = None,
) -> None:
    """
    Upsert a memory record with source-aware conflict resolution.
    Generates and stores an embedding vector on every write.
    """
    from app.config import settings
    from app.providers.embedding import embed_query

    normalized_kind = normalize_memory_kind(memory_kind) or infer_memory_kind(
        key,
        memory_type,
        ttl_days=ttl_days,
        source=source,
    )
    ttl_days = default_ttl_days_for_kind(normalized_kind, ttl_days)

    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(days=ttl_days)) if ttl_days else None
    memory_text = f"{key}: {value}"

    embedding: list[float] | None = None
    try:
        embedding = await embed_query(memory_text)
    except Exception as exc:
        logger.warning("Failed to generate embedding for memory key '%s': %s", key, exc)

    if source == "file":
        conflict_threshold = settings.memory_conflict_confidence_threshold

        conv_record = (
            await db.execute(
                select(UserMemory).where(
                    UserMemory.user_id == user_id,
                    UserMemory.key == key,
                    UserMemory.source == "conversation",
                )
            )
        ).scalar_one_or_none()

        has_high_conf_conv = (
            conv_record is not None
            and (conv_record.confidence or 0.0) >= conflict_threshold
        )

        file_record = (
            await db.execute(
                select(UserMemory).where(
                    UserMemory.user_id == user_id,
                    UserMemory.key == key,
                    UserMemory.source == "file",
                )
            )
        ).scalar_one_or_none()

        if file_record:
            file_record.value = value
            file_record.confidence = confidence
            file_record.memory_type = memory_type
            file_record.memory_kind = normalized_kind
            file_record.expires_at = expires_at
            file_record.updated_at = now
            file_record.embedding = embedding
            file_record.evidence = evidence
            file_record.conflict_flag = has_high_conf_conv
        else:
            db.add(UserMemory(
                id=uuid.uuid4(),
                user_id=user_id,
                key=key,
                value=value,
                confidence=confidence,
                memory_type=memory_type,
                memory_kind=normalized_kind,
                access_count=0,
                expires_at=expires_at,
                updated_at=now,
                embedding=embedding,
                source="file",
                evidence=evidence,
                conflict_flag=has_high_conf_conv,
            ))

        if has_high_conf_conv:
            logger.debug(
                "File memory '%s' conflicts with high-confidence conversation record "
                "(conf=%.2f >= %.2f); written with conflict_flag=True",
                key, conv_record.confidence, conflict_threshold,
            )
        return

    # source == "conversation" (or "manual")
    existing = (
        await db.execute(
            select(UserMemory).where(
                UserMemory.user_id == user_id,
                UserMemory.key == key,
                UserMemory.source == source,
            )
        )
    ).scalar_one_or_none()

    if existing:
        if existing.confidence > confidence + 0.15:
            return
        existing.value = value
        existing.confidence = confidence
        existing.memory_type = memory_type
        existing.memory_kind = normalized_kind
        existing.expires_at = expires_at
        existing.updated_at = now
        existing.embedding = embedding
        existing.evidence = evidence
    else:
        db.add(UserMemory(
            id=uuid.uuid4(),
            user_id=user_id,
            key=key,
            value=value,
            confidence=confidence,
            memory_type=memory_type,
            memory_kind=normalized_kind,
            access_count=0,
            expires_at=expires_at,
            updated_at=now,
            embedding=embedding,
            source=source,
            evidence=evidence,
            conflict_flag=False,
        ))


# ---------------------------------------------------------------------------
# Memory reinforcement & decay
# ---------------------------------------------------------------------------

async def reinforce_memory(
    db: AsyncSession,
    user_id: UUID,
    key: str,
    reflection_id: str,
    delta: float = 0.1,
) -> None:
    """Increase confidence of a memory key (up-rating from reflection)."""
    record = (
        await db.execute(
            select(UserMemory).where(
                UserMemory.user_id == user_id,
                UserMemory.key == key,
                UserMemory.source == "conversation",
            )
        )
    ).scalar_one_or_none()
    if record:
        record.confidence = min(1.0, (record.confidence or 0.5) + delta)
        record.reinforced_by = reflection_id
        record.updated_at = datetime.now(timezone.utc)
    await db.flush()


async def mark_memory_stale(
    db: AsyncSession,
    user_id: UUID,
    key: str,
    delta: float = 0.1,
) -> None:
    """Decrease confidence of a memory key (system-detection from reflection)."""
    record = (
        await db.execute(
            select(UserMemory).where(
                UserMemory.user_id == user_id,
                UserMemory.key == key,
                UserMemory.source == "conversation",
            )
        )
    ).scalar_one_or_none()
    if record:
        record.confidence = max(0.0, (record.confidence or 0.5) - delta)
        if record.confidence < 0.2:
            await db.delete(record)
        else:
            record.updated_at = datetime.now(timezone.utc)
    await db.flush()


async def decay_stale_memories(user_id: UUID, db: AsyncSession) -> int:
    """
    Decay confidence of cold memories (not accessed in 60 days, access_count < 3).
    Deletes memories with confidence < 0.2 and expired fact memories.
    Called by Celery beat task.
    """
    now = datetime.now(timezone.utc)
    threshold_date = now - timedelta(days=60)

    result = await db.execute(
        select(UserMemory).where(UserMemory.user_id == user_id)
    )
    all_memories = result.scalars().all()

    affected = 0
    for m in all_memories:
        if m.expires_at and m.expires_at < now:
            await db.delete(m)
            affected += 1
            continue

        if (
            m.memory_type == "preference"
            and m.last_accessed_at is not None
            and m.last_accessed_at < threshold_date
            and (m.access_count or 0) < 3
        ):
            m.confidence = max(0.0, (m.confidence or 0.5) - 0.1)
            if m.confidence < 0.2:
                await db.delete(m)
            else:
                m.updated_at = now
            affected += 1

    await db.flush()
    logger.info("Decayed %d memory items for user %s", affected, user_id)
    return affected
