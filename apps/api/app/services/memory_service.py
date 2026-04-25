"""
Memory service — unified file-memory sync, runtime cleanup, and setup bootstrap.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppConfig, UserMemory

logger = logging.getLogger(__name__)

_SYNC_MTIME_KEY_PREFIX = "memory_doc_sync_mtime:"
_SYNC_EPSILON_SECONDS = 1e-6


class MemoryService:
    def __init__(self, db: AsyncSession, user_id: UUID):
        self.db = db
        self.user_id = user_id

    async def update_memory_doc(self, content_md: str) -> int:
        from app.agents.memory.file_storage import get_memory_dir, write_memory_doc

        await asyncio.to_thread(write_memory_doc, content_md)
        synced = await self._sync_memory_doc()
        await self._set_synced_mtime(self._memory_doc_mtime(get_memory_dir() / "MEMORY.md"))
        return synced

    async def sync_memory_doc_if_stale(self) -> int:
        from app.agents.memory.file_storage import get_memory_dir

        path = get_memory_dir() / "MEMORY.md"
        current_mtime = self._memory_doc_mtime(path)
        if current_mtime is None:
            return 0

        last_synced = await self._get_synced_mtime()
        if last_synced is not None and current_mtime <= last_synced + _SYNC_EPSILON_SECONDS:
            return 0

        synced = await self._sync_memory_doc()
        await self._set_synced_mtime(current_mtime)
        return synced

    async def cleanup_runtime_memories(self) -> int:
        result = await self.db.execute(
            select(UserMemory).where(UserMemory.user_id == self.user_id)
        )
        memories = list(result.scalars().all())

        authoritative_pairs = {
            (str(m.key).strip(), str(m.value).strip())
            for m in memories
            if m.source in {"conversation", "manual"}
        }

        removed = 0
        for memory in memories:
            key = str(memory.key or "").strip()
            value = str(memory.value or "").strip()

            if key.startswith("diary_"):
                await self.db.delete(memory)
                removed += 1
                continue

            if memory.source == "file" and (key, value) in authoritative_pairs:
                await self.db.delete(memory)
                removed += 1

        if removed:
            await self.db.flush()
        return removed

    async def bootstrap_setup_memories(
        self,
        *,
        user_occupation: str = "",
        user_preferences: str = "",
    ) -> int:
        from app.agents.memory import _upsert_memory

        count = 0

        occupation = user_occupation.strip()
        if occupation:
            await _upsert_memory(
                self.db,
                self.user_id,
                "user_occupation",
                occupation,
                confidence=0.95,
                memory_type="fact",
                ttl_days=None,
                memory_kind="profile",
                source="manual",
                evidence="setup_init.user_occupation",
            )
            count += 1

        preferences = user_preferences.strip()
        if preferences:
            await _upsert_memory(
                self.db,
                self.user_id,
                "user_preferences",
                preferences,
                confidence=0.95,
                memory_type="preference",
                ttl_days=None,
                memory_kind="preference",
                source="manual",
                evidence="setup_init.user_preferences",
            )
            count += 1

        if count:
            await self.db.flush()
        return count

    async def _sync_memory_doc(self) -> int:
        from app.agents.memory.file_storage import sync_memory_doc_to_db

        synced = await sync_memory_doc_to_db(self.user_id, self.db)
        await self.cleanup_runtime_memories()
        return synced

    async def _get_synced_mtime(self) -> float | None:
        row = (
            await self.db.execute(
                select(AppConfig).where(AppConfig.key == self._sync_mtime_key())
            )
        ).scalar_one_or_none()
        if row is None or not row.value:
            return None
        try:
            return float(row.value)
        except (TypeError, ValueError):
            return None

    async def _set_synced_mtime(self, mtime: float | None) -> None:
        value = "" if mtime is None else f"{mtime:.6f}"
        row = (
            await self.db.execute(
                select(AppConfig).where(AppConfig.key == self._sync_mtime_key())
            )
        ).scalar_one_or_none()
        if row is None:
            self.db.add(AppConfig(key=self._sync_mtime_key(), value=value))
            return
        row.value = value

    def _sync_mtime_key(self) -> str:
        return f"{_SYNC_MTIME_KEY_PREFIX}{self.user_id}"

    @staticmethod
    def _memory_doc_mtime(path: Path) -> float | None:
        try:
            return path.stat().st_mtime if path.exists() else None
        except OSError as exc:
            logger.warning("Failed to read MEMORY.md mtime: %s", exc)
            return None
