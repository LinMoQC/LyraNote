from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Conversation, Notebook, Source
from app.providers.llm import get_utility_client, get_utility_model

logger = logging.getLogger(__name__)

FALLBACK_SUGGESTIONS = [
    "帮我分析知识库中的核心主题",
    "为我的研究生成一份结构化摘要",
    "对比不同来源中的相似观点",
    "根据笔记内容生成学习计划",
]

_SUGGESTIONS_CACHE_TTL = timedelta(minutes=30)
_SUGGESTIONS_CACHE_KEY_PREFIX = "ai:suggestions:v1"


class SuggestionService:
    """Suggestion generation and cache management for /ai/suggestions."""

    def __init__(
        self,
        db: AsyncSession,
        *,
        redis_client: aioredis.Redis | None = None,
        utility_client: Any | None = None,
    ):
        self.db = db
        self._redis_client = redis_client
        self._utility_client = utility_client

    async def get_user_suggestions(self, user_id: UUID) -> list[str]:
        """
        Read precomputed suggestions from cache.
        This path never triggers LLM generation.
        """
        payload = await self._read_cached_payload(str(user_id))
        if payload and payload.get("suggestions"):
            return payload["suggestions"]
        return list(FALLBACK_SUGGESTIONS)

    async def refresh_active_user_suggestions(self) -> dict[str, int]:
        """
        Periodically refresh suggestions for active users.
        Returns lightweight stats for logging/monitoring.
        """
        user_ids = await self._list_active_user_ids()
        generated = 0
        skipped = 0
        failed = 0

        for user_id in user_ids:
            try:
                if await self.refresh_user_suggestions(user_id):
                    generated += 1
                else:
                    skipped += 1
            except Exception:
                failed += 1
                logger.exception("Failed to refresh suggestions for user=%s", user_id)

        return {
            "active_users": len(user_ids),
            "generated": generated,
            "skipped": skipped,
            "failed": failed,
        }

    async def refresh_user_suggestions(self, user_id: UUID) -> bool:
        """
        Refresh a single user's cache entry.
        Returns True when a new cache payload is written, False when skipped.
        """
        src_rows, conv_titles = await self._load_user_context(user_id)
        if not src_rows and not conv_titles:
            await self._delete_cached_payload(str(user_id))
            return False

        fingerprint = self._compute_fingerprint(src_rows, conv_titles)
        cached = await self._read_cached_payload(str(user_id))
        if cached and cached.get("fingerprint") == fingerprint and cached.get("suggestions"):
            return False

        suggestions = await self._generate_from_context(src_rows, conv_titles)
        if not suggestions:
            return False

        payload = {
            "suggestions": suggestions,
            "fingerprint": fingerprint,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        await self._write_cached_payload(str(user_id), payload)
        return True

    async def _list_active_user_ids(self) -> list[UUID]:
        """
        Pick users with indexed sources or recent conversations.
        Keeps periodic generation focused on users who can benefit from suggestions.
        """
        indexed_source_users_result = await self.db.execute(
            select(Notebook.user_id)
            .join(Source, Source.notebook_id == Notebook.id)
            .where(Source.status == "indexed")
            .distinct()
        )
        indexed_source_users = set(indexed_source_users_result.scalars().all())

        active_since = datetime.now(timezone.utc) - timedelta(days=30)
        recent_conversation_users_result = await self.db.execute(
            select(Conversation.user_id)
            .where(Conversation.created_at >= active_since)
            .distinct()
        )
        recent_conversation_users = set(recent_conversation_users_result.scalars().all())

        return sorted(indexed_source_users | recent_conversation_users, key=str)

    async def _load_user_context(
        self,
        user_id: UUID,
    ) -> tuple[list[tuple[str | None, str | None]], list[str]]:
        src_rows_result = await self.db.execute(
            select(Source.title, Source.summary)
            .join(Notebook, Source.notebook_id == Notebook.id)
            .where(Notebook.user_id == user_id, Source.status == "indexed")
            .order_by(Source.created_at.desc())
            .limit(8)
        )
        src_rows = src_rows_result.all()

        conv_result = await self.db.execute(
            select(Conversation.title)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.created_at.desc())
            .limit(5)
        )
        conv_titles = [r[0] for r in conv_result.all() if r[0]]
        return src_rows, conv_titles

    def _compute_fingerprint(
        self,
        src_rows: list[tuple[str | None, str | None]],
        conv_titles: list[str],
    ) -> str:
        src_fp = "|".join((title or "").strip() for title, _summary in src_rows)
        conv_fp = "|".join(title.strip() for title in conv_titles)
        return hashlib.md5(f"{src_fp}::{conv_fp}".encode()).hexdigest()

    async def _generate_from_context(
        self,
        src_rows: list[tuple[str | None, str | None]],
        conv_titles: list[str],
    ) -> list[str] | None:
        sources_context = ""
        convs_context = ""

        if src_rows:
            lines = []
            for title, summary in src_rows:
                line = f"- {title or '未命名资料'}"
                if summary:
                    line += f"：{summary[:80]}"
                lines.append(line)
            sources_context = "\n".join(lines)

        if conv_titles:
            convs_context = "\n".join(f"- {title}" for title in conv_titles)

        if not sources_context and not convs_context:
            return None

        prompt_parts = []
        if sources_context:
            prompt_parts.append(f"知识库来源：\n{sources_context}")
        if convs_context:
            prompt_parts.append(f"最近讨论过的话题：\n{convs_context}")
        prompt_parts.append(
            "请基于以上内容，生成4个该用户可能想深入探索的问题。\n"
            "要求：\n"
            '- 只返回一个 JSON 数组，格式：["问题1", "问题2", "问题3", "问题4"]\n'
            "- 每个问题不超过20个汉字\n"
            "- 问题要具体、有针对性，体现知识库的实际内容\n"
            "- 不要输出任何其他文字"
        )
        user_prompt = "\n\n".join(prompt_parts)

        client = self._utility_client or get_utility_client()
        try:
            resp = await client.chat.completions.create(
                model=get_utility_model(),
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是一个知识发现助手。"
                            "你的任务只有一件事：输出一个合法的 JSON 数组，包含4个中文问题字符串。"
                            "格式示例：[\"问题1\", \"问题2\", \"问题3\", \"问题4\"]。"
                            "绝对不要输出任何其他内容，不要输出英文，不要解释，只输出 JSON 数组。"
                        ),
                    },
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.7,
                max_tokens=8000,
            )
        except Exception:
            logger.exception("LLM failed while generating suggestions")
            return None

        raw = (resp.choices[0].message.content or "").strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        if not raw.startswith("["):
            match = re.search(r"\[.*?\]", raw, re.DOTALL)
            if match:
                raw = match.group(0)

        try:
            parsed = json.loads(raw.strip())
            if not isinstance(parsed, list):
                return None
            suggestions = [str(s).strip() for s in parsed if str(s).strip()][:4]
            return suggestions or None
        except Exception:
            logger.warning("Failed to parse suggestion json payload: %s", raw[:200])
            return None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis_client is None:
            self._redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis_client

    def _cache_key(self, user_id: str) -> str:
        return f"{_SUGGESTIONS_CACHE_KEY_PREFIX}:{user_id}"

    async def _read_cached_payload(self, user_id: str) -> dict[str, Any] | None:
        try:
            redis = await self._get_redis()
            raw = await redis.get(self._cache_key(user_id))
            if not raw:
                return None
            data = json.loads(raw)
            suggestions = data.get("suggestions")
            if not isinstance(suggestions, list):
                return None
            normalized = [str(item).strip() for item in suggestions if str(item).strip()][:4]
            if not normalized:
                return None
            data["suggestions"] = normalized
            return data
        except Exception:
            logger.warning("Failed to read suggestions cache for user=%s", user_id, exc_info=True)
            return None

    async def _write_cached_payload(self, user_id: str, payload: dict[str, Any]) -> None:
        try:
            redis = await self._get_redis()
            await redis.setex(
                self._cache_key(user_id),
                int(_SUGGESTIONS_CACHE_TTL.total_seconds()),
                json.dumps(payload, ensure_ascii=False),
            )
        except Exception:
            logger.warning("Failed to write suggestions cache for user=%s", user_id, exc_info=True)

    async def _delete_cached_payload(self, user_id: str) -> None:
        try:
            redis = await self._get_redis()
            await redis.delete(self._cache_key(user_id))
        except Exception:
            logger.warning("Failed to delete suggestions cache for user=%s", user_id, exc_info=True)
