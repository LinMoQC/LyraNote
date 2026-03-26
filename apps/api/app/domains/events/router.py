"""
全局 SSE 事件总线

前端建立一条持久 SSE 连接，订阅 Redis Pub/Sub 频道 soul:{user_id}。
Lyra Soul、主动 Agent 等后端模块只需向该频道 publish 消息，
前端即可实时收到推送，无需轮询。

支持的事件类型（data 字段 JSON）：
  lyra_thought        — Lyra 主动浮现的思考
  proactive_insight   — 主动洞察建议
  source_indexed      — 来源索引完成通知
  portrait_updated    — 用户画像更新完成

Endpoints:
  GET /events/stream   建立 SSE 长连接
"""

from __future__ import annotations

import asyncio
import json
import logging

import redis.asyncio as aioredis
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.config import settings
from app.dependencies import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["events"])

_KEEPALIVE_INTERVAL = 15  # 秒，ping 频率


@router.get("/events/stream")
async def events_stream(
    request: Request,
    current_user: CurrentUser,
) -> StreamingResponse:
    """
    建立用户专属的 SSE 长连接，订阅 Redis Pub/Sub 频道 soul:{user_id}。
    连接断开或心跳超时时自动清理。
    """
    user_id = str(current_user.id)
    channel = f"soul:{user_id}"

    async def generate():
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)
        logger.info("SSE stream opened for user=%s channel=%s", user_id, channel)

        try:
            idle = 0
            while True:
                # 检测客户端是否已断开
                if await request.is_disconnected():
                    break

                msg = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if msg and msg.get("data"):
                    data = msg["data"]
                    # 确保 data 是 JSON 字符串
                    if not isinstance(data, str):
                        data = json.dumps(data)
                    yield f"data: {data}\n\n"
                    idle = 0
                else:
                    idle += 1
                    # 每 _KEEPALIVE_INTERVAL 秒发送一次 ping 保活
                    if idle >= _KEEPALIVE_INTERVAL:
                        yield ": ping\n\n"
                        idle = 0
                    await asyncio.sleep(1.0)
        except asyncio.CancelledError:
            pass
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
                await r.aclose()
            except Exception:
                pass
            logger.info("SSE stream closed for user=%s", user_id)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
