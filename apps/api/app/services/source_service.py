"""
Source service — business logic for sources, chunks, and downloads.

Pattern:
  service = SourceService(db, user_id)
  source = await service.upload_source(notebook_id, file)
"""

from __future__ import annotations

import hashlib
import logging
import os
import uuid
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import enqueue_after_commit
from app.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models import Chunk, Notebook, Source
from app.services.monitoring_service import (
    create_observability_run,
    record_completed_span,
    record_instant_span,
)
from app.trace import generate_trace_id, get_trace_id
from app.utils.async_tasks import create_logged_task

logger = logging.getLogger(__name__)

_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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


@dataclass
class WebImportResult:
    notebook_id: UUID
    created_count: int
    skipped_count: int
    source_ids: list[UUID]


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

    @staticmethod
    def _normalize_web_url(url: str | None) -> str:
        if not url:
            return ""

        raw = url.strip()
        if not raw:
            return ""

        parts = urlsplit(raw)
        filtered_query = [
            (key, value)
            for key, value in parse_qsl(parts.query, keep_blank_values=True)
            if not key.lower().startswith("utm_")
            and key.lower() not in {"fbclid", "gclid", "mc_cid", "mc_eid"}
        ]
        normalized_path = parts.path.rstrip("/") or parts.path or ""
        return urlunsplit((
            parts.scheme.lower(),
            parts.netloc.lower(),
            normalized_path,
            urlencode(filtered_query, doseq=True),
            "",
        ))

    def _dispatch_refresh_summary(self, notebook_id: UUID) -> None:
        create_logged_task(
            self._refresh_summary_safe(notebook_id),
            logger=logger,
            description=f"refresh notebook summary after source change {notebook_id}",
        )

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

    async def _create_source_ingest_run(
        self,
        source: Source,
        *,
        origin: str,
    ):
        trace_id = get_trace_id() or generate_trace_id()
        run = await create_observability_run(
            self.db,
            trace_id=trace_id,
            run_type="source_ingest",
            name="source.ingest",
            status="running",
            user_id=self.user_id,
            task_id=source.id,
            notebook_id=source.notebook_id,
            metadata={
                "origin": origin,
                "source_id": str(source.id),
                "source_title": source.title,
                "source_type": source.type,
                "source_url": source.url,
            },
        )
        return trace_id, run

    def _enqueue_ingestion(
        self,
        source_id: UUID,
        *,
        trace_id: str,
        run_id: UUID,
        job_kind: str = "import",
        job_label: str | None = None,
        chunk_size: int | None = None,
        chunk_overlap: int | None = None,
        splitter_type: str | None = None,
        separators: list[str] | None = None,
        min_chunk_size: int | None = None,
    ) -> None:
        def _dispatch() -> None:
            if settings.is_desktop_runtime:
                from app.services.desktop_runtime_service import desktop_job_manager

                desktop_job_manager.enqueue_source_ingest(
                    user_id=str(self.user_id),
                    source_id=str(source_id),
                    trace_id=trace_id,
                    run_id=str(run_id),
                    kind=job_kind,
                    label=job_label or f"索引任务 {source_id}",
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                    splitter_type=splitter_type,
                    separators=separators,
                    min_chunk_size=min_chunk_size,
                )
                return

            from app.workers.tasks import ingest_source

            logger.info(
                "Dispatching ingest_source for source %s (chunk_size=%s, chunk_overlap=%s, splitter_type=%s)",
                source_id,
                chunk_size,
                chunk_overlap,
                splitter_type,
            )
            if (
                chunk_size is None
                and chunk_overlap is None
                and splitter_type is None
                and separators is None
                and min_chunk_size is None
            ):
                ingest_source.delay(str(source_id), trace_id=trace_id, run_id=str(run_id))
                return

            ingest_source.apply_async(
                args=[str(source_id)],
                kwargs={
                    "trace_id": trace_id,
                    "run_id": str(run_id),
                    "chunk_size": chunk_size,
                    "chunk_overlap": chunk_overlap,
                    "splitter_type": splitter_type,
                    "separators": separators,
                    "min_chunk_size": min_chunk_size,
                },
            )

        enqueue_after_commit(self.db, _dispatch)

    # ── Upload / Import ────────────────────────────────────────────────────────

    async def upload_source(
        self, notebook_id: UUID, filename: str | None, content: bytes
    ) -> Source:
        await self._assert_notebook_owner(notebook_id)

        ext = os.path.splitext(filename or "")[1].lower()
        type_map = {".pdf": "pdf", ".md": "md", ".txt": "md", ".docx": "doc"}
        source_type = type_map.get(ext, "md")

        file_id = str(uuid.uuid4())
        storage_key = f"notebooks/{notebook_id}/{file_id}{ext}"
        content_type = self._guess_content_type(filename or "")

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
        trace_id, run = await self._create_source_ingest_run(source, origin="upload")

        from app.providers.storage import storage as get_storage

        upload_started_at = datetime.now(UTC)
        await get_storage().upload(storage_key, content, content_type)
        await record_completed_span(
            self.db,
            "source_ingest.upload",
            run=run,
            component="api",
            span_kind="phase",
            status="succeeded",
            metadata={
                "content_type": content_type,
                "filename": filename,
                "byte_length": len(content),
            },
            started_at=upload_started_at,
            finished_at=datetime.now(UTC),
        )

        self._enqueue_ingestion(
            source.id,
            trace_id=trace_id,
            run_id=run.id,
            job_kind="import",
            job_label=f"索引资料：{filename or '未命名文件'}",
        )
        await self.db.commit()

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
        trace_id, run = await self._create_source_ingest_run(source, origin="url_import")
        await record_instant_span(
            self.db,
            "source_ingest.upload",
            run=run,
            component="api",
            span_kind="phase",
            status="succeeded",
            metadata={"mode": "url", "url": url, "skipped": True},
        )

        self._enqueue_ingestion(
            source.id,
            trace_id=trace_id,
            run_id=run.id,
            job_kind="import",
            job_label=f"索引网页：{title or url}",
        )
        await self.db.commit()

        return source

    async def import_web_sources(
        self,
        sources: list[dict],
        *,
        notebook_id: UUID | None = None,
    ) -> WebImportResult:
        target_notebook_id = notebook_id
        if target_notebook_id is not None:
            await self._assert_notebook_owner(target_notebook_id)
        else:
            nb = await self._get_or_create_global_notebook()
            target_notebook_id = nb.id

        existing_result = await self.db.execute(
            select(Source.url).where(
                Source.notebook_id == target_notebook_id,
                Source.url.isnot(None),
            )
        )
        existing_urls = {
            normalized
            for normalized in (
                self._normalize_web_url(url)
                for url in existing_result.scalars().all()
            )
            if normalized
        }

        created_count = 0
        skipped_count = 0
        source_ids: list[UUID] = []

        for item in sources:
            normalized_url = self._normalize_web_url(item.get("url"))
            if not normalized_url or normalized_url in existing_urls:
                skipped_count += 1
                continue

            source = Source(
                notebook_id=target_notebook_id,
                title=(item.get("title") or normalized_url)[:500],
                type="web",
                status="pending",
                url=normalized_url,
            )
            self.db.add(source)
            await self.db.flush()
            await self.db.refresh(source)
            trace_id, run = await self._create_source_ingest_run(source, origin="web_batch_import")
            await record_instant_span(
                self.db,
                "source_ingest.upload",
                run=run,
                component="api",
                span_kind="phase",
                status="succeeded",
                metadata={"mode": "url", "url": normalized_url, "skipped": True},
            )

            self._enqueue_ingestion(
                source.id,
                trace_id=trace_id,
                run_id=run.id,
                job_kind="import",
                job_label=f"索引网页：{source.title or normalized_url}",
            )

            existing_urls.add(normalized_url)
            created_count += 1
            source_ids.append(source.id)

        if created_count > 0:
            await self.db.commit()

        return WebImportResult(
            notebook_id=target_notebook_id,
            created_count=created_count,
            skipped_count=skipped_count,
            source_ids=source_ids,
        )

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
        splitter_type: str = "auto",
        separators: list[str] | None = None,
        min_chunk_size: int = 50,
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
        trace_id, run = await self._create_source_ingest_run(source, origin="rechunk")

        self._enqueue_ingestion(
            source.id,
            trace_id=trace_id,
            run_id=run.id,
            job_kind="rechunk",
            job_label=f"重建索引：{source.title or source.id}",
            chunk_size=size,
            chunk_overlap=overlap,
            splitter_type=splitter_type,
            separators=separators,
            min_chunk_size=min_chunk_size,
        )
        await self.db.commit()
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
        type_map = {".pdf": "pdf", ".md": "md", ".txt": "md", ".docx": "doc"}
        source_type = type_map.get(ext, "md")

        file_id = str(uuid.uuid4())
        storage_key = f"global/{nb.id}/{file_id}{ext}"
        content_type = self._guess_content_type(filename or "")

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
        trace_id, run = await self._create_source_ingest_run(source, origin="global_upload")

        from app.providers.storage import storage as get_storage
        upload_started_at = datetime.now(UTC)
        await get_storage().upload(storage_key, content, content_type)
        await record_completed_span(
            self.db,
            "source_ingest.upload",
            run=run,
            component="api",
            span_kind="phase",
            status="succeeded",
            metadata={
                "content_type": content_type,
                "filename": filename,
                "byte_length": len(content),
            },
            started_at=upload_started_at,
            finished_at=datetime.now(UTC),
        )
        self._enqueue_ingestion(
            source.id,
            trace_id=trace_id,
            run_id=run.id,
            job_kind="import",
            job_label=f"索引资料：{filename or '未命名文件'}",
        )
        await self.db.commit()

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
        trace_id, run = await self._create_source_ingest_run(
            source, origin="global_url_import"
        )
        await record_instant_span(
            self.db,
            "source_ingest.upload",
            run=run,
            component="api",
            span_kind="phase",
            status="succeeded",
            metadata={"mode": "url", "url": url, "skipped": True},
        )

        self._enqueue_ingestion(
            source.id,
            trace_id=trace_id,
            run_id=run.id,
            job_kind="import",
            job_label=f"索引网页：{title or url}",
        )
        await self.db.commit()

        return source

    async def import_global_source_path(
        self,
        path: str,
        *,
        sha256: str | None = None,
    ) -> Source:
        file_path = Path(path).expanduser()
        if not file_path.exists():
            raise NotFoundError("文件不存在")
        if not file_path.is_file():
            raise BadRequestError("暂不支持导入目录")

        try:
            content = file_path.read_bytes()
        except OSError as exc:
            raise BadRequestError("无法读取所选文件") from exc

        content_sha256 = sha256
        if settings.is_desktop_runtime and not content_sha256:
            content_sha256 = hashlib.sha256(content).hexdigest()

        if settings.is_desktop_runtime:
            from app.services.desktop_runtime_service import desktop_state_store

            inspection = desktop_state_store.inspect_local_file(
                user_id=str(self.user_id),
                path=str(file_path.resolve()),
                sha256=content_sha256,
            )
            existing_source_id = inspection.get("source_id")
            if inspection["state"] in {"unchanged", "duplicate"} and existing_source_id:
                try:
                    existing_source = await self._get_owned_source(UUID(str(existing_source_id)))
                except (NotFoundError, ValueError):
                    existing_source = None
                if existing_source is not None:
                    desktop_state_store.record_import(
                        user_id=str(self.user_id),
                        path=str(file_path.resolve()),
                        source_id=str(existing_source.id),
                        title=existing_source.title or file_path.name,
                        sha256=content_sha256,
                    )
                    return existing_source

        source = await self.upload_global_source(file_path.name, content)

        if settings.is_desktop_runtime:
            from app.services.desktop_runtime_service import desktop_state_store

            desktop_state_store.record_import(
                user_id=str(self.user_id),
                path=str(file_path.resolve()),
                source_id=str(source.id),
                title=source.title or file_path.name,
                sha256=content_sha256,
            )

        return source
