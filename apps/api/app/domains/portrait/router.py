"""
用户画像 API

Endpoints:
  GET  /portrait          获取当前用户的最新画像
  POST /portrait/trigger  手动触发画像合成（开发/测试用）
  GET  /portrait/history  获取画像版本历史（最近 3 版的摘要）
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, status

from app.dependencies import CurrentUser, DbDep
from app.schemas.response import ApiResponse, success

logger = logging.getLogger(__name__)

router = APIRouter(tags=["portrait"])


@router.get("/portrait", response_model=ApiResponse[dict | None])
async def get_my_portrait(
    current_user: CurrentUser,
    db: DbDep,
) -> ApiResponse[dict | None]:
    """返回当前用户的最新用户画像 JSON（含 avatar_url 字段）。"""
    from sqlalchemy import select
    from app.agents.portrait.loader import load_latest_portrait
    from app.models import UserPortrait

    portrait = await load_latest_portrait(db, current_user.id)
    if portrait is None:
        return success(None)

    # Merge avatar_url from the DB column so the portrait page can display it
    row = (
        await db.execute(
            select(UserPortrait.avatar_url).where(UserPortrait.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if row:
        portrait = {**portrait, "avatar_url": row}

    return success(portrait)


@router.post("/portrait/trigger", status_code=status.HTTP_202_ACCEPTED, response_model=ApiResponse[dict])
async def trigger_portrait_synthesis(
    current_user: CurrentUser,
    db: DbDep,
    background_tasks: BackgroundTasks,
) -> ApiResponse[dict]:
    """
    手动触发当前用户的画像合成（异步后台执行）。
    通常由 Celery Beat 自动触发，此端点供手动测试。
    """
    async def _run():
        from app.agents.portrait.synthesizer import synthesize_portrait
        from app.agents.portrait.loader import invalidate_portrait_cache
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await synthesize_portrait(current_user.id, session)
        await invalidate_portrait_cache(current_user.id)

    background_tasks.add_task(_run)
    return success({"queued": True, "user_id": str(current_user.id)})


@router.get("/portrait/history", response_model=ApiResponse[list[dict]])
async def get_portrait_history(
    current_user: CurrentUser,
    db: DbDep,
) -> ApiResponse[list[dict]]:
    """
    返回画像历史摘要（当前仅返回最新一版，未来可扩展为多版本表）。
    """
    from sqlalchemy import select
    from app.models import UserPortrait

    row = (
        await db.execute(
            select(UserPortrait).where(UserPortrait.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if row is None:
        return success([])

    history = [
        {
            "version": row.version,
            "synthesis_summary": row.synthesis_summary,
            "synthesized_at": row.synthesized_at.isoformat() if row.synthesized_at else None,
            "portrait_json": row.portrait_json,
        }
    ]
    return success(history)
