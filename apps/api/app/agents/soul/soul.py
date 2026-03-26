"""
AgentSoul — Lyra 的灵魂思维循环

这是 Lyra 的"心跳"。它作为一个持久的 asyncio 协程运行在 FastAPI
的 lifespan 中，不断感知用户活动、产生自发思考，并在合适时机将洞察
推送给用户。

设计原则：
  - 不打扰：推送频率有严格限制（默认 8 分钟内不重复推送同一用户）
  - 有温度：LLM prompt 以"伙伴"视角生成，而非机器通知
  - 有记忆：所有思考（无论是否推送）都持久化到 agent_thoughts 表
  - 感知上下文：读取 Redis 中的用户活动快照（由前端心跳写入）

架构：
  Perception → Soul._think() → _surface_thought() → Redis Pub/Sub → SSE → 用户
                             ↘ _store_internal_thought() → DB
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

# 每轮思考循环的间隔（秒）
_THINK_LOOP_INTERVAL = 120  # 2 分钟扫描一次活跃用户

# 同一用户两次「浮现」推送之间的最小间隔（秒）
_SURFACE_COOLDOWN = 480  # 8 分钟

# LLM 思考 prompt
_SOUL_MONOLOGUE_PROMPT = """你是 Lyra，一个内嵌在个人知识管理应用中的 AI 助手。

你刚刚观察到用户当前的活动：
{activity_context}

基于这些活动，生成一句简短、有价值的想法（1-3句），帮助或启发用户。

要求：
- 以关心用户的知识伙伴身份发言，而不是机器人
- 内容要具体，与用户当前活动相关
- 提供关联、问题或温和的建议
- 如果用户处于创作或研究状态，不要轻易打扰，除非真的有很有价值的想法
- 简洁温暖

以 JSON 格式返回：
{{
  "should_surface": true或false,
  "content": "你的想法",
  "reasoning": "为何选择这个可见性的简短说明"
}}"""


class AgentSoul:
    """
    Lyra 的思维灵魂。

    生命周期：
      await soul.start()   — 在 FastAPI lifespan 中启动
      await soul.stop()    — 在 FastAPI lifespan 关闭时停止
    """

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        """启动思维循环（非阻塞）。"""
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._thinking_loop(), name="lyra-soul")
        logger.info("AgentSoul started")

    async def stop(self) -> None:
        """优雅停止思维循环。"""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("AgentSoul stopped")

    # ------------------------------------------------------------------
    # 核心思维循环
    # ------------------------------------------------------------------

    async def _thinking_loop(self) -> None:
        """主循环：每隔 _THINK_LOOP_INTERVAL 秒扫描活跃用户并思考。"""
        while self._running:
            try:
                await self._scan_and_think()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("AgentSoul thinking loop error")
            await asyncio.sleep(_THINK_LOOP_INTERVAL)

    async def _scan_and_think(self) -> None:
        """扫描所有活跃用户并为每人产生一次思考。"""
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        try:
            keys = await r.keys("activity:*")
            for key in keys:
                user_id = key.removeprefix("activity:")
                raw = await r.get(key)
                if not raw:
                    continue
                try:
                    activity = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                await self._think(user_id=user_id, activity=activity, redis=r)
        finally:
            await r.aclose()

    async def _think(
        self,
        *,
        user_id: str,
        activity: dict,
        redis: aioredis.Redis,
    ) -> None:
        """为单个用户产生一次思考，并决定是否推送给用户。"""
        # 检查冷却期：避免频繁打扰用户
        cooldown_key = f"soul_cooldown:{user_id}"
        if await redis.exists(cooldown_key):
            return

        try:
            prompt = _SOUL_MONOLOGUE_PROMPT.format(
                activity_context=json.dumps(activity, ensure_ascii=False, indent=2)
            )
            from app.providers.llm import chat
            from app.providers.llm import get_utility_model

            raw = await chat(
                messages=[{"role": "user", "content": prompt}],
                model=get_utility_model(),
                temperature=0.85,
                max_tokens=1500,
            )

            result = _parse_soul_response(raw)
        except Exception:
            logger.warning("AgentSoul LLM call failed for user=%s", user_id, exc_info=True)
            return

        content = result.get("content", "")
        should_surface = result.get("should_surface", False)

        # 持久化到数据库
        notebook_id = activity.get("notebook_id")
        await _store_thought(
            user_id=user_id,
            content=content,
            activity_context=activity,
            notebook_id=notebook_id,
            visibility="surfaced" if should_surface else "internal",
        )

        if should_surface and content:
            await self._surface_thought(
                user_id=user_id, content=content, redis=redis
            )
            # 设置冷却期
            await redis.setex(cooldown_key, _SURFACE_COOLDOWN, "1")

    async def _surface_thought(
        self,
        *,
        user_id: str,
        content: str,
        redis: aioredis.Redis,
    ) -> None:
        """将思考发布到 Redis Pub/Sub → SSE → 用户界面。"""
        channel = f"soul:{user_id}"
        payload = json.dumps(
            {
                "type": "lyra_thought",
                "content": content,
                "ts": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
        )
        await redis.publish(channel, payload)
        logger.debug("Surfaced thought to user=%s", user_id)


# ---------------------------------------------------------------------------
# 全局单例
# ---------------------------------------------------------------------------

soul = AgentSoul()


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------

def _parse_soul_response(raw: str) -> dict:
    """从 LLM 响应中提取 JSON。兼容 markdown code block 包裹。"""
    text = raw.strip()
    # 去掉可能的 ```json ... ``` 包裹
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # fallback: 尝试直接用原始文本作为 content
        return {"should_surface": False, "content": text, "reasoning": "parse_error"}


async def _store_thought(
    *,
    user_id: str,
    content: str,
    activity_context: dict,
    notebook_id: str | None,
    visibility: str,
) -> None:
    """将思考持久化到 agent_thoughts 数据库表。"""
    try:
        from app.database import AsyncSessionLocal
        from app.models import AgentThought

        async with AsyncSessionLocal() as db:
            thought = AgentThought(
                id=uuid.uuid4(),
                user_id=uuid.UUID(user_id),
                visibility=visibility,
                content=content,
                activity_context=activity_context,
                notebook_id=uuid.UUID(notebook_id) if notebook_id else None,
            )
            db.add(thought)
            await db.commit()
    except Exception:
        logger.warning("Failed to store agent thought to DB", exc_info=True)
