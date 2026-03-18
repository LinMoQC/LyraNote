"""
Message feedback API — lets users rate assistant replies (like/dislike).

Endpoints:
  POST /messages/{message_id}/feedback          Create or update feedback
  GET  /conversations/{conversation_id}/feedback  List feedback for a conversation
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.domains.feedback.schemas import FeedbackIn, FeedbackOut
from app.exceptions import NotFoundError
from app.models import Conversation, Message, MessageFeedback
from app.schemas.response import ApiResponse, success

router = APIRouter(tags=["feedback"])


async def _load_owned_message(message_id: UUID, user_id: UUID, db: DbDep) -> Message:
    result = await db.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Message.id == message_id, Conversation.user_id == user_id)
    )
    msg = result.scalar_one_or_none()
    if msg is None:
        raise NotFoundError("消息不存在")
    return msg


@router.post("/messages/{message_id}/feedback", response_model=ApiResponse[FeedbackOut])
async def submit_feedback(
    message_id: UUID,
    body: FeedbackIn,
    db: DbDep,
    current_user: CurrentUser,
):
    await _load_owned_message(message_id, current_user.id, db)

    existing = (
        await db.execute(
            select(MessageFeedback).where(
                MessageFeedback.message_id == message_id,
                MessageFeedback.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    now = datetime.utcnow()
    if existing:
        existing.rating = body.rating
        existing.comment = body.comment
        existing.updated_at = now
        await db.flush()
        return success(existing)

    feedback = MessageFeedback(
        message_id=message_id,
        user_id=current_user.id,
        rating=body.rating,
        comment=body.comment,
        created_at=now,
        updated_at=now,
    )
    db.add(feedback)
    await db.flush()
    return success(feedback)


@router.get("/conversations/{conversation_id}/feedback", response_model=ApiResponse[list[FeedbackOut]])
async def list_conversation_feedback(
    conversation_id: UUID,
    db: DbDep,
    current_user: CurrentUser,
):
    conv = (
        await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if conv is None:
        raise NotFoundError("对话不存在")

    rows = (
        await db.execute(
            select(MessageFeedback)
            .join(Message, MessageFeedback.message_id == Message.id)
            .where(Message.conversation_id == conversation_id, MessageFeedback.user_id == current_user.id)
            .order_by(MessageFeedback.created_at.asc())
        )
    ).scalars().all()
    return success(rows)
