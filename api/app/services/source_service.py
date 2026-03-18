"""
Source service — business logic for sources, chunks, and downloads.

Pattern:
  service = SourceService(db, user_id)
  source = await service.upload_source(notebook_id, file)
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import ConflictError, NotFoundError
from app.models import Chunk, Notebook, Source

logger = logging.getLogger(__name__)

_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".md": "text/markdown",
    ".txt": "text/plain",
}


@dataclass
class DownloadRedirect:
    url: str


@dataclass
class DownloadStream:
    chunks: Iterator[bytes] | AsyncIterator[bytes]
    filename: str
    media_type: str


DownloadResult = DownloadRedirect | DownloadStream


class SourceService:
    """Source domain business logic."""

    def __init__(self, db: AsyncSession, user_id: UUID):
        self.db = db
        self.user_id = user_id

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _guess_content_type(filename: str) -> str:
        ext = os.path.splitext(filename)[1].lower()
        return _CONTENT_TYPES.get(ext, "application/octet-stream")

    async def _assert_notebook_owner(self, notebook_id: UUID) -> None:
        result = await self.db.execute(
            select(Notebook).where(
                Notebook.id == notebook_id, Notebook.user_id == self.user_id
            )
        )
        if result.scalar_one_or_none() is None:
            raise NotFoundError("笔记本不存在")

    async def _get_owned_source(self, source_id: UUID) -> Source:
        result = await self.db.execute(
            select(Source)
            .join(Notebook, Source.notebook_id == Notebook.id)
            .where(Source.id == source_id, Notebook.user_id == self.user_id)
        )
        source = result.scalar_one_or_none()
        if source is None:
            raise NotFoundError("资源不存在")
        return source

    async def _get_or_create_global_notebook(self) -> Notebook:
        result = await self.db.execute(
            select(Notebook).where(
                Notebook.user_id == self.user_id, Notebook.is_global.is_(True)
            )
        )
        nb = result.scalar_one_or_none()
        if nb is None:
            nb = Notebook(
                user_id=self.user_id,
                title="全局知识库",
                description="全局来源，不绑定具体笔记本。",
                is_global=True,
                is_system=False,
                status="active",
            )
            self.db.add(nb)
            await self.db.flush()
            await self.db.refresh(nb)
        return nb

    def _dispatch_refresh_summary(self, notebook_id: UUID) -> None:
        asyncio.create_task(self._refresh_summary_safe(notebook_id))

    async def _refresh_summary_safe(self, notebook_id: UUID) -> None:
        from app.agents.memory import refresh_notebook_summary
        from app.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as session:
                await refresh_notebook_summary(notebook_id, session)
                await session.commit()
        except Exception as exc:
            logger.warning("Failed to refresh notebook summary after source deletion: %s", exc)

    async def _stream_file(self, file_path: str) -> AsyncIterator[bytes]:
        import aiofiles
        async with aiofiles.open(file_path, "rb") as f:
            while chunk := await f.read(65536):
                yield chunk

    # ── Upload / Import ────────────────────────────────────────────────────────

    async def upload_source(
        self, notebook_id: UUID, filename: str | None, content: bytes
    ) -> Source:
        await self._assert_notebook_owner(notebook_id)

        ext = os.path.splitext(filename or "")[1].lower()
        type_map = {".pdf": "pdf", ".md": "md", ".txt": "md"}
        source_type = type_map.get(ext, "md")

        file_id = str(uuid.uuid4())
        storage_key = f"notebooks/{notebook_id}/{file_id}{ext}"
        content_type = self._guess_content_type(filename or "")

        from app.providers.storage import storage as get_storage
        await get_storage().upload(storage_key, content, content_type)

        source = Source(
            notebook_id=notebook_id,
            title=filename,
            type=source_type,
            status="pending",
            storage_key=storage_key,
            storage_backend=settings.storage_backend,
        )
        self.db.add(source)
        await self.db.flush()
        await self.db.refresh(source)

        from app.workers.tasks import ingest_source
        ingest_source.delay(str(source.id))

        return source

    async def import_source_url(
        self, notebook_id: UUID, url: str, title: str | None
    ) -> Source:
        await self._assert_notebook_owner(notebook_id)

        source = Source(
            notebook_id=notebook_id,
            title=title or url,
            type="web",
            status="pending",
            url=url,
        )
        self.db.add(source)
        await self.db.flush()
        await self.db.refresh(source)

        from app.workers.tasks import ingest_source
        ingest_source.delay(str(source.id))

        return source

    # ── List ──────────────────────────────────────────────────────────────────

    async def list_all_sources(
        self,
        *,
        offset: int = 0,
        limit: int = 20,
        type_filter: str | None = None,
        search: str | None = None,
    ) -> tuple[list[Source], int]:
        base = (
            select(Source)
            .join(Notebook, Source.notebook_id == Notebook.id)
            .where(Notebook.user_id == self.user_id)
        )

        if type_filter and type_filter != "all":
            type_map = {"doc": ["md", "note", "doc"], "pdf": ["pdf"], "web": ["web"], "audio": ["audio"]}
            allowed = type_map.get(type_filter, [type_filter])
            base = base.where(Source.type.in_(allowed))

        if search:
            pattern = f"%{search}%"
            base = base.where(Source.title.ilike(pattern) | Source.summary.ilike(pattern))

        count_result = await self.db.execute(select(func.count()).select_from(base.subquery()))
        total = count_result.scalar() or 0

        result = await self.db.execute(
            base.order_by(Source.created_at.desc()).offset(offset).limit(limit)
        )
        items = list(result.scalars().all())
        return items, total

    async def list_sources(self, notebook_id: UUID) -> list[Source]:
        await self._assert_notebook_owner(notebook_id)
        result = await self.db.execute(
            select(Source)
            .where(Source.notebook_id == notebook_id)
            .order_by(Source.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_chunks(self, source_id: UUID) -> list:
        source = await self._get_owned_source(source_id)
        result = await self.db.execute(
            select(Chunk)
            .where(Chunk.source_id == source.id)
            .order_by(Chunk.chunk_index.asc())
        )
        return list(result.scalars().all())

    # ── Update / Rechunk ──────────────────────────────────────────────────────

    async def update_source(self, source_id: UUID, *, title: str | None = None, notebook_id: UUID | None = None) -> Source:
        source = await self._get_owned_source(source_id)
        if title is not None:
            source.title = title
        if notebook_id is not None:
            result = await self.db.execute(
                select(Notebook).where(
                    Notebook.id == notebook_id,
                    Notebook.user_id == self.user_id,
                )
            )
            if result.scalar_one_or_none() is None:
                raise NotFoundError("目标笔记本不存在")
            source.notebook_id = notebook_id
            await self.db.execute(
                Chunk.__table__.update()
                .where(Chunk.source_id == source.id)
                .values(notebook_id=notebook_id)
            )
        await self.db.flush()
        await self.db.refresh(source)
        return source

    async def rechunk_source(
        self,
        source_id: UUID,
        *,
        strategy: str = "standard",
        chunk_size: int | None = None,
        chunk_overlap: int | None = None,
    ) -> tuple[int, int]:
        from app.domains.source.schemas import STRATEGY_PARAMS

        source = await self._get_owned_source(source_id)
        if source.status == "processing":
            raise ConflictError("资源正在处理中，请稍后重试")

        default_size, default_overlap = STRATEGY_PARAMS.get(strategy, (512, 64))
        size = chunk_size or default_size
        overlap = chunk_overlap or default_overlap

        source.status = "pending"
        await self.db.flush()

        from app.workers.tasks import ingest_source
        ingest_source.apply_async(
            args=[str(source.id)],
            kwargs={"chunk_size": size, "chunk_overlap": overlap},
        )
        return size, overlap

    # ── Download ──────────────────────────────────────────────────────────────

    async def get_download(self, source_id: UUID) -> DownloadResult:
        source = await self._get_owned_source(source_id)
        if not source.storage_key and not source.file_path:
            raise NotFoundError("该资源没有关联的文件")

        from app.providers.storage import storage as get_storage

        if source.storage_key:
            url = await get_storage().get_url(source.storage_key, expires_in=3600)

            if url.startswith("/api/"):
                try:
                    content = await get_storage().download(source.storage_key)
                except FileNotFoundError:
                    raise NotFoundError("文件未找到")
                filename = source.title or source.storage_key.split("/")[-1]
                media_type = self._guess_content_type(filename)
                return DownloadStream(
                    chunks=iter([content]),
                    filename=filename,
                    media_type=media_type,
                )

            return DownloadRedirect(url=url)

        if source.file_path and os.path.exists(source.file_path):
            filename = source.title or os.path.basename(source.file_path)
            return DownloadStream(
                chunks=self._stream_file(source.file_path),
                filename=filename,
                media_type=self._guess_content_type(source.file_path),
            )

        raise NotFoundError("文件未找到")

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete_source(self, source_id: UUID) -> None:
        source = await self._get_owned_source(source_id)
        notebook_id = source.notebook_id

        from app.providers.storage import storage as get_storage
        if source.storage_key:
            try:
                await get_storage().delete(source.storage_key)
            except Exception as exc:
                logger.warning("Failed to delete storage file %s: %s", source.storage_key, exc)
        elif source.file_path and os.path.exists(source.file_path):
            try:
                os.unlink(source.file_path)
            except OSError as exc:
                logger.warning("Failed to delete legacy local file %s: %s", source.file_path, exc)

        await self.db.delete(source)
        await self.db.flush()
        self._dispatch_refresh_summary(notebook_id)

    # ── Global (unbound) sources ───────────────────────────────────────────────

    async def list_global_sources(self) -> list[Source]:
        nb = await self._get_or_create_global_notebook()
        result = await self.db.execute(
            select(Source)
            .where(Source.notebook_id == nb.id)
            .order_by(Source.created_at.desc())
        )
        return list(result.scalars().all())

    async def upload_global_source(self, filename: str | None, content: bytes) -> Source:
        nb = await self._get_or_create_global_notebook()

        ext = os.path.splitext(filename or "")[1].lower()
        type_map = {".pdf": "pdf", ".md": "md", ".txt": "md"}
        source_type = type_map.get(ext, "md")

        file_id = str(uuid.uuid4())
        storage_key = f"global/{nb.id}/{file_id}{ext}"
        content_type = self._guess_content_type(filename or "")

        from app.providers.storage import storage as get_storage
        await get_storage().upload(storage_key, content, content_type)

        source = Source(
            notebook_id=nb.id,
            title=filename,
            type=source_type,
            status="pending",
            storage_key=storage_key,
            storage_backend=settings.storage_backend,
        )
        self.db.add(source)
        await self.db.flush()
        await self.db.refresh(source)

        from app.workers.tasks import ingest_source
        ingest_source.delay(str(source.id))

        return source

    async def import_global_source_url(self, url: str, title: str | None) -> Source:
        nb = await self._get_or_create_global_notebook()

        source = Source(
            notebook_id=nb.id,
            title=title or url,
            type="web",
            status="pending",
            url=url,
        )
        self.db.add(source)
        await self.db.flush()
        await self.db.refresh(source)

        from app.workers.tasks import ingest_source
        ingest_source.delay(str(source.id))

        return source
