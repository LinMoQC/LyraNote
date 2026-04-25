"""
用户活动心跳 API

用户在前端每 30 秒上报一次当前的操作快照，后端将其存入 Redis
并设置 120 秒 TTL。Lyra Soul 会读取此快照来感知用户上下文。

Endpoints:
  POST /activity/heartbeat   上报活动快照
  GET  /activity/current     获取当前活动快照（调试用）
"""

from __future__ import annotations

import json
import logging

import redis.asyncio as aioredis
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings
from app.dependencies import CurrentUser
from app.schemas.response import ApiResponse, success

logger = logging.getLogger(__name__)

router = APIRouter(tags=["activity"])


class ActivitySnapshot(BaseModel):
    """前端上报的用户活动快照。"""
    action: str = "idle"
    notebook_id: str | None = None
    notebook_title: str | None = None
    note_id: str | None = None
    note_title: str | None = None
    editor_word_count: int | None = None
    active_source_id: str | None = None
    copilot_open: bool = False
    is_mobile: bool = False
    typing_recently: bool = False
    last_interaction_ms: int | None = None
    timestamp_ms: int | None = None


@router.post("/activity/heartbeat", response_model=ApiResponse[dict])
async def heartbeat(
    body: ActivitySnapshot,
    current_user: CurrentUser,
) -> ApiResponse[dict]:
    """接收前端心跳，将活动快照写入 Redis（TTL 120 秒）。"""
    key = f"activity:{current_user.id}"
    payload = body.model_dump()

    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        async with r:
            await r.setex(key, 120, json.dumps(payload))
    except Exception:
        logger.warning("Failed to write activity heartbeat to Redis", exc_info=True)

    return success({"ok": True})


@router.get("/activity/current", response_model=ApiResponse[ActivitySnapshot | None])
async def get_current_activity(current_user: CurrentUser) -> ApiResponse[ActivitySnapshot | None]:
    """读取当前用户最新的活动快照（开发调试用）。"""
    key = f"activity:{current_user.id}"
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        async with r:
            raw = await r.get(key)
        if raw:
            return success(ActivitySnapshot(**json.loads(raw)))
    except Exception:
        logger.warning("Failed to read activity snapshot from Redis", exc_info=True)
    return success(None)
