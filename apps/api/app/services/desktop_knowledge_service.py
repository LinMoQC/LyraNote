from __future__ import annotations

from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.exceptions import BadRequestError, NotFoundError
from app.models import Chunk, Notebook, Source
from app.services.desktop_runtime_service import (
    SUPPORTED_WATCH_EXTENSIONS,
    compute_file_sha256,
    desktop_job_manager,
    desktop_state_store,
    emit_desktop_event,
)
from app.services.source_service import SourceService


class DesktopKnowledgeService:
    def __init__(self, db: AsyncSession | None, user_id: UUID | str) -> None:
        self.db = db
        self.user_id = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
        desktop_job_manager.ensure_started()

    @property
    def user_id_str(self) -> str:
        return str(self.user_id)

    def list_watch_folders(self) -> dict:
        return {"items": desktop_state_store.list_watch_folders(user_id=self.user_id_str)}

    def create_watch_folder(self, *, path: str) -> dict:
        try:
            return desktop_state_store.create_watch_folder(user_id=self.user_id_str, path=path)
        except FileNotFoundError as exc:
            raise BadRequestError("目录不存在") from exc
        except NotADirectoryError as exc:
            raise BadRequestError("只能注册目录，不能注册文件") from exc
        except Exception as exc:
            if "UNIQUE constraint failed" in str(exc):
                raise BadRequestError("该目录已注册为监听目录") from exc
            raise

    def delete_watch_folder(self, *, folder_id: str) -> None:
        deleted = desktop_state_store.delete_watch_folder(
            user_id=self.user_id_str,
            folder_id=folder_id,
        )
        if not deleted:
            raise NotFoundError("监听目录不存在")

    def list_recent_imports(self) -> dict:
        return {"items": desktop_state_store.list_recent_imports(user_id=self.user_id_str)}

    def inspect_local_file(
        self,
        *,
        path: str,
        sha256: str | None = None,
    ) -> dict:
        normalized = str(Path(path).expanduser().resolve())
        try:
            return desktop_state_store.inspect_local_file(
                user_id=self.user_id_str,
                path=normalized,
                sha256=sha256,
            )
        except FileNotFoundError as exc:
            raise NotFoundError("文件不存在") from exc
        except IsADirectoryError as exc:
            raise BadRequestError("暂不支持导入目录") from exc

    async def import_watch_folder_path(self, *, path: str) -> dict:
        normalized = str(Path(path).expanduser().resolve())
        folder = desktop_state_store.find_matching_watch_folder(
            user_id=self.user_id_str,
            path=normalized,
        )
        if folder is None:
            raise BadRequestError("文件不在已注册的监听目录内")

        file_path = Path(normalized)
        if not file_path.exists():
            desktop_state_store.touch_watch_folder_error(
                user_id=self.user_id_str,
                path=normalized,
                error="文件不存在",
            )
            raise NotFoundError("文件不存在")
        if not file_path.is_file():
            raise BadRequestError("暂不支持导入目录")
        if file_path.suffix.lower() not in SUPPORTED_WATCH_EXTENSIONS:
            raise BadRequestError("该文件类型暂不支持自动导入")
        if not desktop_state_store.should_process_watch_path(
            user_id=self.user_id_str,
            path=normalized,
        ):
            return {"state": "skipped", "path": normalized}

        digest = compute_file_sha256(normalized)
        inspection = desktop_state_store.inspect_local_file(
            user_id=self.user_id_str,
            path=normalized,
            sha256=digest,
        )
        if inspection["state"] in {"unchanged", "duplicate"}:
            desktop_state_store.record_import(
                user_id=self.user_id_str,
                path=normalized,
                source_id=inspection.get("source_id"),
                title=inspection.get("matched_title") or file_path.name,
                sha256=digest,
            )
            emit_desktop_event(
                "import.result",
                {
                    "path": normalized,
                    "source_id": inspection.get("source_id"),
                    "state": inspection["state"],
                },
            )
            return {
                "state": inspection["state"],
                "path": normalized,
                "source_id": inspection.get("source_id"),
            }

        try:
            async with AsyncSessionLocal() as db:
                source = await SourceService(db, self.user_id).import_global_source_path(
                    normalized,
                    sha256=digest,
                )
        except Exception as exc:
            desktop_state_store.touch_watch_folder_error(
                user_id=self.user_id_str,
                path=normalized,
                error=str(exc),
            )
            emit_desktop_event(
                "import.failed",
                {"path": normalized, "state": "failed", "error": str(exc)},
            )
            raise

        emit_desktop_event(
            "import.result",
            {
                "path": normalized,
                "source_id": str(source.id),
                "state": "queued",
            },
        )
        return {
            "state": "queued",
            "path": normalized,
            "source_id": str(source.id),
        }

    def _require_db(self) -> AsyncSession:
        if self.db is None:
            raise RuntimeError("Desktop knowledge service requires a database session")
        return self.db

    async def ensure_local_index_warmed(self) -> int:
        if desktop_state_store.count_local_chunks(user_id=self.user_id_str) > 0:
            return 0

        db = self._require_db()
        result = await db.execute(
            select(Source.id)
            .join(Notebook, Source.notebook_id == Notebook.id)
            .where(
                Notebook.user_id == self.user_id,
                Source.status == "indexed",
            )
            .order_by(Source.updated_at.desc())
        )
        source_ids = [row[0] for row in result.all()]
        synced = 0
        for source_id in source_ids:
            synced += await self.sync_source_chunks(source_id)
        return synced

    async def sync_source_chunks(self, source_id: UUID | str) -> int:
        db = self._require_db()
        source_uuid = source_id if isinstance(source_id, UUID) else UUID(str(source_id))

        source_result = await db.execute(
            select(Source)
            .join(Notebook, Source.notebook_id == Notebook.id)
            .where(Source.id == source_uuid, Notebook.user_id == self.user_id)
        )
        source = source_result.scalar_one_or_none()
        if source is None:
            raise NotFoundError("资源不存在")

        chunk_result = await db.execute(
            select(Chunk)
            .where(Chunk.source_id == source.id)
            .order_by(Chunk.chunk_index.asc())
        )
        chunks = list(chunk_result.scalars().all())
        desktop_state_store.sync_source_chunks(
            user_id=self.user_id_str,
            source_id=str(source.id),
            notebook_id=str(source.notebook_id),
            source_title=source.title,
            source_type=source.type,
            chunks=[
                {
                    "chunk_id": str(chunk.id),
                    "chunk_index": int(chunk.chunk_index or 0),
                    "content": chunk.content,
                    "metadata": chunk.metadata_,
                }
                for chunk in chunks
            ],
        )
        return len(chunks)

    async def search_local(
        self,
        *,
        query: str,
        notebook_id: UUID | str | None = None,
        source_id: UUID | str | None = None,
        limit: int = 5,
    ) -> dict:
        await self.ensure_local_index_warmed()
        items = desktop_state_store.search_local_chunks(
            user_id=self.user_id_str,
            query=query,
            notebook_id=str(notebook_id) if notebook_id is not None else None,
            source_id=str(source_id) if source_id is not None else None,
            limit=limit,
        )
        return {
            "query": query,
            "mode": "fts5",
            "items": items,
        }
