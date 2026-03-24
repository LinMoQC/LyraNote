"""
用户画像加载器

提供带 Redis 缓存的画像读取接口，供 composer.py、AgentSoul 和
Orchestrator 调用，避免每次对话都查询数据库。

缓存 Key：portrait:{user_id}，TTL = 3600 秒（1 小时）。
画像合成后调用 invalidate_portrait_cache() 主动淘汰。
"""

from __future__ import annotations

import json
import logging
import uuid

logger = logging.getLogger(__name__)

_CACHE_TTL = 3600  # 1 hour


async def load_latest_portrait(
    db: "AsyncSession",  # noqa: F821
    user_id: uuid.UUID | str,
) -> dict | None:
    """
    加载用户的最新画像 JSON。

    查询顺序：Redis 缓存 → PostgreSQL → None
    返回 None 代表用户尚无画像或数据量不足未合成。
    """
    uid = str(user_id)
    cache_key = f"portrait:{uid}"

    # ── 1. 尝试 Redis 缓存 ───────────────────────────────────────────────────
    try:
        from app.config import settings
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        async with r:
            cached = await r.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        logger.debug("Portrait Redis cache miss for user=%s", uid, exc_info=True)

    # ── 2. 查询数据库 ────────────────────────────────────────────────────────
    try:
        from sqlalchemy import select
        from app.models import UserPortrait

        row = (
            await db.execute(
                select(UserPortrait).where(UserPortrait.user_id == uuid.UUID(uid) if isinstance(user_id, str) else UserPortrait.user_id == user_id)
            )
        ).scalar_one_or_none()

        if row is None or not row.portrait_json:
            return None

        portrait = row.portrait_json

        # 写入 Redis 缓存
        try:
            from app.config import settings
            import redis.asyncio as aioredis

            r = aioredis.from_url(settings.redis_url, decode_responses=True)
            async with r:
                await r.setex(cache_key, _CACHE_TTL, json.dumps(portrait, ensure_ascii=False))
        except Exception:
            pass

        return portrait
    except Exception:
        logger.warning("Failed to load portrait for user=%s", uid, exc_info=True)
        return None


async def invalidate_portrait_cache(user_id: uuid.UUID | str) -> None:
    """画像更新后调用，淘汰 Redis 缓存。"""
    uid = str(user_id)
    try:
        from app.config import settings
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        async with r:
            await r.delete(f"portrait:{uid}")
    except Exception:
        logger.debug("Failed to invalidate portrait cache for user=%s", uid, exc_info=True)
