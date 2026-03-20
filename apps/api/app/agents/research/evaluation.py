"""
Evaluation Agent — lightweight async conversation quality scoring.

Triggered after SSE completion at a configurable sampling rate
(memory_evaluation_sample_rate). Results are written to agent_evaluations
and used for monitoring only (not fed back into real-time responses in v1).

Distinct from AgentReflection (L5):
  - AgentReflection evaluates Agent execution (did it use tools correctly?)
  - AgentEvaluation evaluates conversation outcome (was the user well served?)
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgentEvaluation, Message

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic schema for LLM output
# ---------------------------------------------------------------------------

class _EvaluationResult(BaseModel):
    overall_score: Annotated[float, Field(ge=0.0, le=1.0)]
    relevance_score: Annotated[float, Field(ge=0.0, le=1.0)]
    evidence_score: Annotated[float, Field(ge=0.0, le=1.0)]
    actionability_score: Annotated[float, Field(ge=0.0, le=1.0)]
    notes: str | None = None


# ---------------------------------------------------------------------------
# Evaluation prompt
# ---------------------------------------------------------------------------

EVALUATION_PROMPT = """
你是一个 AI 对话质量评估助手。请评估以下对话的质量。

从三个维度评分（0.0-1.0）：
1. relevance_score（相关性）：AI 回答是否切题，是否准确理解用户意图
2. evidence_score（证据质量）：AI 是否引用了具体证据、知识或来源支撑其回答
3. actionability_score（可操作性）：AI 的回答是否提供了具体可行的建议或结论

overall_score = 以上三项的加权平均（权重各 1/3）。

以 JSON 格式返回（严格遵守，不要添加其他内容）：
{{
  "overall_score": 0.0,
  "relevance_score": 0.0,
  "evidence_score": 0.0,
  "actionability_score": 0.0,
  "notes": "简短评价说明（中文，1-2句话）"
}}

对话内容：
{conversation}

只返回 JSON。
""".strip()


# ---------------------------------------------------------------------------
# Main evaluation function
# ---------------------------------------------------------------------------

async def evaluate_conversation(
    conversation_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> AgentEvaluation | None:
    """
    Score the conversation and persist an AgentEvaluation record.
    Returns the record on success, None on failure.
    """
    from app.providers.llm import chat

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .limit(30)
    )
    messages = result.scalars().all()

    # Need at least one user + one assistant message to evaluate
    roles = {m.role for m in messages}
    if "user" not in roles or "assistant" not in roles:
        logger.debug("Skipping evaluation for conversation %s: insufficient messages", conversation_id)
        return None

    conv_text = "\n".join(
        f"{'用户' if m.role == 'user' else 'AI'}: {m.content[:400]}"
        for m in messages
    )

    try:
        raw = await chat(
            [
                {"role": "system", "content": "你是一个 AI 对话质量评估助手，只输出 JSON。"},
                {"role": "user", "content": EVALUATION_PROMPT.format(conversation=conv_text)},
            ],
            temperature=0.1,
        )
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        parsed = _EvaluationResult.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError, Exception) as exc:
        logger.warning(
            "Evaluation failed for conversation %s: %s", conversation_id, exc
        )
        return None

    record = AgentEvaluation(
        id=uuid.uuid4(),
        conversation_id=conversation_id,
        user_id=user_id,
        overall_score=parsed.overall_score,
        relevance_score=parsed.relevance_score,
        evidence_score=parsed.evidence_score,
        actionability_score=parsed.actionability_score,
        notes=parsed.notes,
    )
    db.add(record)
    await db.flush()

    logger.info(
        "Evaluation complete for conversation %s — overall=%.2f relevance=%.2f "
        "evidence=%.2f actionability=%.2f",
        conversation_id,
        parsed.overall_score,
        parsed.relevance_score,
        parsed.evidence_score,
        parsed.actionability_score,
    )
    return record
