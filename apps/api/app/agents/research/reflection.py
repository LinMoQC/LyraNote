"""
Reflection Agent — L5 of the memory architecture.

After each conversation turn, this module asks the LLM to self-evaluate
its performance and extracts structured signals:

  - quality_score:      0.0-1.0 overall answer quality
  - what_worked:        which memories/strategies made the answer accurate
  - what_failed:        where the answer missed the mark
  - memory_reinforced:  list of memory keys to up-rate (up-rating)

The reflection is written to agent_reflections table, and memory confidence
is adjusted accordingly (reinforce_memory / mark_memory_stale).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgentReflection, Message

logger = logging.getLogger(__name__)

REFLECTION_PROMPT = """
你刚刚完成了一次对话（场景：{scene}）。请对自己的表现进行简短评估。

你掌握的关于该用户的记忆信息：
{memory_context}

对话内容（最近 10 条）：
{conversation}

请输出以下 JSON：
{{
  "quality_score": 0.0-1.0,
  "what_worked": "哪些关于用户的信息让你的回答更准确、更贴合（简短描述，50字内）",
  "what_failed": "哪些地方回答偏离了用户期望，或使用了错误的假设（简短描述，50字内，没有问题则填null）",
  "memory_reinforced": ["被验证有效的记忆key1", "记忆key2"]
}}

只返回 JSON，不要其他内容。
""".strip()


async def reflect_on_conversation(
    conversation_id: UUID,
    user_id: UUID,
    scene: str,
    memory_context: list[dict],
    db: AsyncSession,
) -> None:
    """
    Post-conversation self-reflection.
    Writes to agent_reflections and adjusts memory confidence.
    Should be called fire-and-forget with its own DB session.
    """
    from app.providers.llm import chat
    from app.agents.memory import reinforce_memory, mark_memory_stale

    # Load recent conversation messages
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(10)
    )
    messages = list(reversed(result.scalars().all()))
    if len(messages) < 2:
        return

    conv_text = "\n".join(
        f"{'用户' if m.role == 'user' else 'AI'}: {m.content[:200]}"
        for m in messages
    )

    memory_text = "\n".join(
        f"  - {m['key']}: {m['value']}"
        for m in (memory_context or [])
    ) or "（暂无记忆信息）"

    try:
        raw = await chat(
            [
                {"role": "system", "content": "你是一个AI性能分析助手，只输出 JSON。"},
                {
                    "role": "user",
                    "content": REFLECTION_PROMPT.format(
                        scene=scene,
                        memory_context=memory_text,
                        conversation=conv_text,
                    ),
                },
            ],
            temperature=0.1,
            max_tokens=300,
        )
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        data: dict = json.loads(raw)
    except Exception as exc:
        logger.warning("Reflection LLM call failed: %s", exc)
        return

    quality_score = float(data.get("quality_score") or 0.5)
    what_worked: str | None = data.get("what_worked")
    what_failed: str | None = data.get("what_failed")
    memory_reinforced: list[str] = [
        str(k) for k in (data.get("memory_reinforced") or []) if k
    ]

    # Persist reflection record
    reflection_id = str(uuid.uuid4())
    reflection = AgentReflection(
        id=uuid.UUID(reflection_id),
        user_id=user_id,
        conversation_id=conversation_id,
        scene=scene,
        quality_score=quality_score,
        what_worked=what_worked,
        what_failed=what_failed,
        memory_reinforced=memory_reinforced,
        created_at=datetime.now(timezone.utc),
    )
    db.add(reflection)
    await db.flush()

    # up-rating: reinforce memories that were validated as useful
    for key in memory_reinforced:
        await reinforce_memory(db, user_id, key, reflection_id, delta=0.1)

    # system-detection: if answer quality is low, flag the memories that may be stale
    if quality_score < 0.5 and what_failed:
        stale_keys = await _detect_stale_keys_from_failure(what_failed, memory_context)
        for key in stale_keys:
            await mark_memory_stale(db, user_id, key, delta=0.1)

    await db.flush()
    logger.info(
        "Reflection saved for conversation %s — scene=%s quality=%.2f reinforced=%s",
        conversation_id, scene, quality_score, memory_reinforced,
    )


async def _detect_stale_keys_from_failure(
    what_failed: str,
    memory_context: list[dict],
) -> list[str]:
    """
    Heuristic: if the failure description mentions a memory key's value,
    that key might be stale. Returns up to 2 candidate keys.
    """
    stale: list[str] = []
    failure_lower = what_failed.lower()
    for m in memory_context:
        val_lower = str(m.get("value", "")).lower()
        key = m.get("key", "")
        # If the memory value appears verbatim in the failure description
        if val_lower and len(val_lower) > 4 and val_lower in failure_lower:
            stale.append(key)
        if len(stale) >= 2:
            break
    return stale
