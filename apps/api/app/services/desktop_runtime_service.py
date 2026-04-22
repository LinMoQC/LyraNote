from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from app.config import settings
from app.database import AsyncSessionLocal

SUPPORTED_WATCH_EXTENSIONS = {".pdf", ".md", ".txt", ".docx"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def emit_desktop_event(event_type: str, payload: dict[str, Any]) -> None:
    if not settings.is_desktop_runtime or not settings.desktop_stdout_events:
        return

    print(
        json.dumps(
            {
                "type": event_type,
                "payload": payload,
                "occurred_at": _now_iso(),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


@dataclass
class DesktopJobRecord:
    id: str
    user_id: str
    kind: str
    state: str
    label: str
    progress: int
    message: str | None
    resource_id: str | None
    payload_json: str
    created_at: str
    updated_at: str


class DesktopStateStore:
    def __init__(self) -> None:
        self._db_path: Path | None = None
        self._init_lock = threading.Lock()
        self._ensure_initialized()

    @property
    def db_path(self) -> Path:
        return self._ensure_initialized()

    def _target_db_path(self) -> Path:
        return (settings.desktop_state_dir / "runtime-state.sqlite3").resolve()

    def _ensure_initialized(self) -> Path:
        target = self._target_db_path()
        with self._init_lock:
            if self._db_path == target:
                return target
            target.parent.mkdir(parents=True, exist_ok=True)
            self._init_db(target)
            self._db_path = target
        return target

    def _connect(self, db_path: Path | None = None) -> sqlite3.Connection:
        if db_path is None:
            target = self._target_db_path()
            db_path = target if self._db_path == target else self._ensure_initialized()
        conn = sqlite3.connect(db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self, db_path: Path) -> None:
        with self._connect(db_path) as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS desktop_jobs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    state TEXT NOT NULL,
                    label TEXT NOT NULL,
                    progress INTEGER NOT NULL DEFAULT 0,
                    message TEXT,
                    resource_id TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_desktop_jobs_user_updated
                    ON desktop_jobs(user_id, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_desktop_jobs_state_created
                    ON desktop_jobs(state, created_at ASC);

                CREATE TABLE IF NOT EXISTS watch_folders (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    path TEXT NOT NULL,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    last_synced_at TEXT,
                    last_error TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    UNIQUE(user_id, path)
                );

                CREATE TABLE IF NOT EXISTS recent_imports (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    path TEXT NOT NULL,
                    source_id TEXT,
                    title TEXT,
                    imported_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_recent_imports_user_time
                    ON recent_imports(user_id, imported_at DESC);

                CREATE TABLE IF NOT EXISTS watched_file_state (
                    user_id TEXT NOT NULL,
                    path TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    mtime_ns INTEGER NOT NULL,
                    source_id TEXT,
                    title TEXT,
                    sha256 TEXT,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY(user_id, path)
                );
                """
            )
            self._ensure_column(conn, "watched_file_state", "title", "TEXT")
            self._ensure_column(conn, "watched_file_state", "sha256", "TEXT")
            conn.executescript(
                """
                CREATE INDEX IF NOT EXISTS idx_watched_file_state_user_sha256
                    ON watched_file_state(user_id, sha256)
                ;

                CREATE VIRTUAL TABLE IF NOT EXISTS desktop_chunk_fts USING fts5(
                    chunk_id UNINDEXED,
                    user_id UNINDEXED,
                    source_id UNINDEXED,
                    notebook_id UNINDEXED,
                    source_title UNINDEXED,
                    source_type UNINDEXED,
                    chunk_index UNINDEXED,
                    metadata_json UNINDEXED,
                    content,
                    tokenize='unicode61 remove_diacritics 2'
                );
                """
            )

    @staticmethod
    def _ensure_column(
        conn: sqlite3.Connection,
        table: str,
        column: str,
        definition: str,
    ) -> None:
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        if any(str(row["name"]) == column for row in rows):
            return
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def list_jobs(self, *, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, kind, state, label, progress, message, resource_id, created_at, updated_at
                FROM desktop_jobs
                WHERE user_id = ?
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_recent_imports(
        self,
        *,
        user_id: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT path, source_id, title, imported_at
                FROM recent_imports
                WHERE user_id = ?
                ORDER BY imported_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def create_job(
        self,
        *,
        user_id: str,
        kind: str,
        label: str,
        resource_id: str | None,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        job_id = str(uuid.uuid4())
        now = _now_iso()
        payload_json = json.dumps(payload, ensure_ascii=False)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO desktop_jobs (
                    id, user_id, kind, state, label, progress, message, resource_id, payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, 'queued', ?, 0, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    user_id,
                    kind,
                    label,
                    "已加入桌面队列",
                    resource_id,
                    payload_json,
                    now,
                    now,
                ),
            )
        return self.get_job(job_id)

    def get_job(self, job_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, user_id, kind, state, label, progress, message, resource_id, payload_json, created_at, updated_at
                FROM desktop_jobs
                WHERE id = ?
                """,
                (job_id,),
            ).fetchone()
        if row is None:
            raise KeyError(job_id)
        return dict(row)

    def next_queued_job(self) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id
                FROM desktop_jobs
                WHERE state = 'queued'
                ORDER BY created_at ASC
                LIMIT 1
                """
            ).fetchone()
        if row is None:
            return None
        return self.get_job(str(row["id"]))

    def update_job(
        self,
        job_id: str,
        *,
        state: str,
        progress: int | None = None,
        message: str | None = None,
    ) -> dict[str, Any]:
        now = _now_iso()
        current = self.get_job(job_id)
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE desktop_jobs
                SET state = ?, progress = ?, message = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    state,
                    current["progress"] if progress is None else progress,
                    current["message"] if message is None else message,
                    now,
                    job_id,
                ),
            )
        return self.get_job(job_id)

    def cancel_job(self, *, user_id: str, job_id: str) -> dict[str, Any]:
        job = self.get_job(job_id)
        if job["user_id"] != user_id:
            return {"cancelled": False, "reason": "任务不存在"}
        if job["state"] == "queued":
            self.update_job(job_id, state="cancelled", progress=0, message="任务已取消")
            return {"cancelled": True, "reason": None}
        if job["state"] in {"succeeded", "failed", "cancelled"}:
            return {"cancelled": False, "reason": "任务已经结束"}
        return {"cancelled": False, "reason": "运行中的任务暂不支持中断"}

    def list_watch_folders(self, *, user_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, path, name, created_at, last_synced_at, last_error, is_active
                FROM watch_folders
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user_id,),
            ).fetchall()
        return [
            {
                **dict(row),
                "is_active": bool(row["is_active"]),
            }
            for row in rows
        ]

    def create_watch_folder(self, *, user_id: str, path: str) -> dict[str, Any]:
        folder = Path(path).expanduser().resolve()
        if not folder.exists():
            raise FileNotFoundError("目录不存在")
        if not folder.is_dir():
            raise NotADirectoryError("只能注册目录，不能注册文件")

        now = _now_iso()
        row_id = str(uuid.uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO watch_folders (
                    id, user_id, path, name, created_at, last_synced_at, last_error, is_active
                ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 1)
                """,
                (row_id, user_id, str(folder), folder.name or str(folder), now),
            )
        return self.get_watch_folder(user_id=user_id, folder_id=row_id)

    def get_watch_folder(self, *, user_id: str, folder_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, path, name, created_at, last_synced_at, last_error, is_active
                FROM watch_folders
                WHERE user_id = ? AND id = ?
                """,
                (user_id, folder_id),
            ).fetchone()
        if row is None:
            raise KeyError(folder_id)
        return {
            **dict(row),
            "is_active": bool(row["is_active"]),
        }

    def delete_watch_folder(self, *, user_id: str, folder_id: str) -> bool:
        with self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM watch_folders WHERE user_id = ? AND id = ?",
                (user_id, folder_id),
            )
        return cursor.rowcount > 0

    def find_matching_watch_folder(self, *, user_id: str, path: str) -> dict[str, Any] | None:
        normalized = str(Path(path).expanduser().resolve())
        for item in self.list_watch_folders(user_id=user_id):
            folder_path = item["path"]
            if normalized == folder_path or normalized.startswith(f"{folder_path}{os.sep}"):
                return item
        return None

    def should_process_watch_path(self, *, user_id: str, path: str) -> bool:
        normalized = str(Path(path).expanduser().resolve())
        stat = os.stat(normalized)
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT size, mtime_ns
                FROM watched_file_state
                WHERE user_id = ? AND path = ?
                """,
                (user_id, normalized),
            ).fetchone()
        if row is None:
            return True
        return not (
            int(row["size"]) == stat.st_size and int(row["mtime_ns"]) == stat.st_mtime_ns
        )

    def inspect_local_file(
        self,
        *,
        user_id: str,
        path: str,
        sha256: str | None = None,
    ) -> dict[str, Any]:
        normalized = str(Path(path).expanduser().resolve())
        file_path = Path(normalized)
        if not file_path.exists():
            raise FileNotFoundError(normalized)
        if not file_path.is_file():
            raise IsADirectoryError(normalized)

        stat = os.stat(normalized)
        with self._connect() as conn:
            path_row = conn.execute(
                """
                SELECT path, size, mtime_ns, source_id, title, sha256, updated_at
                FROM watched_file_state
                WHERE user_id = ? AND path = ?
                """,
                (user_id, normalized),
            ).fetchone()

            if path_row is not None:
                if sha256 and path_row["sha256"] and path_row["sha256"] == sha256:
                    return {
                        "state": "unchanged",
                        "path": normalized,
                        "source_id": path_row["source_id"],
                        "matched_path": path_row["path"],
                        "matched_title": path_row["title"],
                        "sha256": path_row["sha256"],
                    }
                if (
                    not sha256
                    and int(path_row["size"]) == stat.st_size
                    and int(path_row["mtime_ns"]) == stat.st_mtime_ns
                ):
                    return {
                        "state": "unchanged",
                        "path": normalized,
                        "source_id": path_row["source_id"],
                        "matched_path": path_row["path"],
                        "matched_title": path_row["title"],
                        "sha256": path_row["sha256"],
                    }

            if sha256:
                digest_row = conn.execute(
                    """
                    SELECT path, source_id, title, sha256
                    FROM watched_file_state
                    WHERE user_id = ? AND sha256 = ? AND path != ?
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """,
                    (user_id, sha256, normalized),
                ).fetchone()
                if digest_row is not None:
                    return {
                        "state": "duplicate",
                        "path": normalized,
                        "source_id": digest_row["source_id"],
                        "matched_path": digest_row["path"],
                        "matched_title": digest_row["title"],
                        "sha256": digest_row["sha256"],
                    }

        if path_row is not None:
            return {
                "state": "updated",
                "path": normalized,
                "source_id": path_row["source_id"],
                "matched_path": path_row["path"],
                "matched_title": path_row["title"],
                "sha256": sha256,
            }

        return {
            "state": "new",
            "path": normalized,
            "source_id": None,
            "matched_path": None,
            "matched_title": None,
            "sha256": sha256,
        }

    def record_import(
        self,
        *,
        user_id: str,
        path: str,
        source_id: str | None,
        title: str | None,
        sha256: str | None = None,
    ) -> None:
        normalized = str(Path(path).expanduser().resolve())
        now = _now_iso()
        stat = os.stat(normalized)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO recent_imports (id, user_id, path, source_id, title, imported_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), user_id, normalized, source_id, title, now),
            )
            conn.execute(
                """
                INSERT INTO watched_file_state (
                    user_id, path, size, mtime_ns, source_id, title, sha256, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, path)
                DO UPDATE SET
                    size = excluded.size,
                    mtime_ns = excluded.mtime_ns,
                    source_id = excluded.source_id,
                    title = excluded.title,
                    sha256 = excluded.sha256,
                    updated_at = excluded.updated_at
                """,
                (
                    user_id,
                    normalized,
                    stat.st_size,
                    stat.st_mtime_ns,
                    source_id,
                    title,
                    sha256,
                    now,
                ),
            )
            conn.execute(
                """
                DELETE FROM recent_imports
                WHERE user_id = ?
                  AND id NOT IN (
                    SELECT id FROM recent_imports
                    WHERE user_id = ?
                    ORDER BY imported_at DESC
                    LIMIT 20
                  )
                """,
                (user_id, user_id),
            )

        self.touch_watch_folder_success(user_id=user_id, path=normalized)

    def count_local_chunks(self, *, user_id: str) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS total FROM desktop_chunk_fts WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return int(row["total"] or 0) if row is not None else 0

    def sync_source_chunks(
        self,
        *,
        user_id: str,
        source_id: str,
        notebook_id: str,
        source_title: str | None,
        source_type: str,
        chunks: list[dict[str, Any]],
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM desktop_chunk_fts WHERE user_id = ? AND source_id = ?",
                (user_id, source_id),
            )
            for chunk in chunks:
                conn.execute(
                    """
                    INSERT INTO desktop_chunk_fts (
                        chunk_id,
                        user_id,
                        source_id,
                        notebook_id,
                        source_title,
                        source_type,
                        chunk_index,
                        metadata_json,
                        content
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk["chunk_id"],
                        user_id,
                        source_id,
                        notebook_id,
                        source_title,
                        source_type,
                        chunk["chunk_index"],
                        json.dumps(chunk.get("metadata") or {}, ensure_ascii=False),
                        chunk["content"],
                    ),
                )

    @staticmethod
    def _normalize_fts_query(query: str) -> str:
        cleaned = (
            query.replace('"', " ")
            .replace("'", " ")
            .replace(":", " ")
            .replace("*", " ")
            .replace("(", " ")
            .replace(")", " ")
        )
        tokens = [token.strip() for token in cleaned.split() if token.strip()]
        return " ".join(tokens) if tokens else query.strip()

    def search_local_chunks(
        self,
        *,
        user_id: str,
        query: str,
        notebook_id: str | None = None,
        source_id: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        raw_query = query.strip()
        if not raw_query:
            return []

        clauses = ["user_id = ?"]
        params: list[Any] = [user_id]
        if notebook_id:
            clauses.append("notebook_id = ?")
            params.append(notebook_id)
        if source_id:
            clauses.append("source_id = ?")
            params.append(source_id)

        filter_sql = " AND ".join(clauses)
        fts_query = self._normalize_fts_query(raw_query)

        with self._connect() as conn:
            try:
                rows = conn.execute(
                    f"""
                    SELECT
                        chunk_id,
                        source_id,
                        notebook_id,
                        source_title,
                        source_type,
                        chunk_index,
                        metadata_json,
                        content,
                        snippet(desktop_chunk_fts, 8, '<<', '>>', '…', 18) AS excerpt,
                        bm25(desktop_chunk_fts) AS rank
                    FROM desktop_chunk_fts
                    WHERE desktop_chunk_fts MATCH ? AND {filter_sql}
                    ORDER BY rank ASC, chunk_index ASC
                    LIMIT ?
                    """,
                    [fts_query, *params, limit],
                ).fetchall()
            except sqlite3.OperationalError:
                rows = []

            if not rows:
                like_pattern = f"%{raw_query}%"
                rows = conn.execute(
                    f"""
                    SELECT
                        chunk_id,
                        source_id,
                        notebook_id,
                        source_title,
                        source_type,
                        chunk_index,
                        metadata_json,
                        content,
                        substr(content, 1, 220) AS excerpt,
                        NULL AS rank
                    FROM desktop_chunk_fts
                    WHERE {filter_sql}
                      AND (
                        content LIKE ?
                        OR COALESCE(source_title, '') LIKE ?
                      )
                    ORDER BY chunk_index ASC
                    LIMIT ?
                    """,
                    [*params, like_pattern, like_pattern, limit],
                ).fetchall()

        items: list[dict[str, Any]] = []
        for row in rows:
            metadata_json = row["metadata_json"]
            try:
                metadata = json.loads(metadata_json) if metadata_json else None
            except json.JSONDecodeError:
                metadata = None
            excerpt = (row["excerpt"] or row["content"][:220]).replace("<<", "").replace(">>", "")
            rank = row["rank"]
            items.append(
                {
                    "chunk_id": str(row["chunk_id"]),
                    "source_id": str(row["source_id"]),
                    "notebook_id": str(row["notebook_id"]),
                    "source_title": row["source_title"],
                    "source_type": row["source_type"],
                    "chunk_index": int(row["chunk_index"]),
                    "content": row["content"],
                    "excerpt": excerpt,
                    "rank": float(rank) if rank is not None else None,
                    "metadata": metadata,
                }
            )
        return items

    def touch_watch_folder_success(self, *, user_id: str, path: str) -> None:
        match = self.find_matching_watch_folder(user_id=user_id, path=path)
        if not match:
            return
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE watch_folders
                SET last_synced_at = ?, last_error = NULL
                WHERE user_id = ? AND id = ?
                """,
                (_now_iso(), user_id, match["id"]),
            )

    def touch_watch_folder_error(self, *, user_id: str, path: str, error: str) -> None:
        match = self.find_matching_watch_folder(user_id=user_id, path=path)
        if not match:
            return
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE watch_folders
                SET last_error = ?
                WHERE user_id = ? AND id = ?
                """,
                (error, user_id, match["id"]),
            )


def compute_file_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class DesktopJobManager:
    def __init__(self, store: DesktopStateStore) -> None:
        self._store = store
        self._wake = threading.Event()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._running_job_id: str | None = None

    def ensure_started(self) -> None:
        if not settings.is_desktop_runtime:
            return
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._thread = threading.Thread(
                target=self._loop,
                name="desktop-job-runner",
                daemon=True,
            )
            self._thread.start()

    def enqueue_source_ingest(
        self,
        *,
        user_id: str,
        source_id: str,
        kind: str,
        label: str,
        chunk_size: int | None,
        chunk_overlap: int | None,
        splitter_type: str | None,
        separators: list[str] | None,
        min_chunk_size: int | None,
    ) -> str:
        self.ensure_started()
        job = self._store.create_job(
            user_id=user_id,
            kind=kind,
            label=label,
            resource_id=source_id,
            payload={
                "source_id": source_id,
                "chunk_size": chunk_size,
                "chunk_overlap": chunk_overlap,
                "splitter_type": splitter_type,
                "separators": separators,
                "min_chunk_size": min_chunk_size,
            },
        )
        emit_desktop_event(
            "job.progress",
            {
                "id": job["id"],
                "kind": kind,
                "state": "queued",
                "progress": 0,
                "message": job["message"],
                "resource_id": source_id,
            },
        )
        self._wake.set()
        return str(job["id"])

    def cancel_job(self, *, user_id: str, job_id: str) -> dict[str, Any]:
        result = self._store.cancel_job(user_id=user_id, job_id=job_id)
        if result["cancelled"]:
            job = self._store.get_job(job_id)
            emit_desktop_event(
                "job.progress",
                {
                    "id": job_id,
                    "kind": job["kind"],
                    "state": "cancelled",
                    "progress": 0,
                    "message": "任务已取消",
                    "resource_id": job["resource_id"],
                },
            )
        return result

    def _loop(self) -> None:
        while True:
            job = self._store.next_queued_job()
            if job is None:
                self._wake.wait(timeout=1.0)
                self._wake.clear()
                continue

            job_id = str(job["id"])
            self._running_job_id = job_id
            running = self._store.update_job(
                job_id,
                state="running",
                progress=15,
                message="正在执行桌面索引任务",
            )
            emit_desktop_event(
                "job.progress",
                {
                    "id": job_id,
                    "kind": running["kind"],
                    "state": "running",
                    "progress": running["progress"],
                    "message": running["message"],
                    "resource_id": running["resource_id"],
                },
            )

            try:
                asyncio.run(self._process_job(running))
            except Exception as error:  # pragma: no cover - worker safety net
                failed = self._store.update_job(
                    job_id,
                    state="failed",
                    progress=100,
                    message=str(error),
                )
                emit_desktop_event(
                    "job.failed",
                    {
                        "id": job_id,
                        "kind": failed["kind"],
                        "state": failed["state"],
                        "progress": failed["progress"],
                        "message": failed["message"],
                        "resource_id": failed["resource_id"],
                    },
                )
                emit_desktop_event(
                    "import.failed",
                    {
                        "job_id": job_id,
                        "source_id": failed["resource_id"],
                        "state": "failed",
                        "error": failed["message"],
                    },
                )
            finally:
                self._running_job_id = None

    async def _process_job(self, job: dict[str, Any]) -> None:
        from app.agents.rag.ingestion import ingest
        from app.models import Source
        from app.services.desktop_knowledge_service import DesktopKnowledgeService
        from app.workers.tasks.ingestion import _mark_source_failed
        from sqlalchemy import select

        payload = json.loads(job["payload_json"])
        source_id = str(payload["source_id"])
        chunk_size = payload.get("chunk_size") or 512
        chunk_overlap = payload.get("chunk_overlap") or 64
        splitter_type = payload.get("splitter_type") or "recursive"
        separators = payload.get("separators")
        min_chunk_size = payload.get("min_chunk_size") or 50

        async with AsyncSessionLocal() as db:
            try:
                await ingest(
                    source_id,
                    db,
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                    splitter_type=splitter_type,
                    separators=separators,
                    min_chunk_size=min_chunk_size,
                )
                await db.commit()
                await DesktopKnowledgeService(
                    db,
                    UUID(str(job["user_id"])),
                ).sync_source_chunks(source_id)
            except Exception as error:
                await db.rollback()
                async with AsyncSessionLocal() as db2:
                    result = await db2.execute(
                        select(Source).where(Source.id == UUID(source_id))
                    )
                    source = result.scalar_one_or_none()
                    if source is not None:
                        _mark_source_failed(source, str(error))
                        await db2.commit()
                raise

        completed = self._store.update_job(
            str(job["id"]),
            state="succeeded",
            progress=100,
            message="桌面索引任务已完成",
        )
        emit_desktop_event(
            "job.completed",
            {
                "id": completed["id"],
                "kind": completed["kind"],
                "state": completed["state"],
                "progress": completed["progress"],
                "message": completed["message"],
                "resource_id": completed["resource_id"],
            },
        )
        emit_desktop_event(
            "import.result",
            {
                "job_id": completed["id"],
                "source_id": completed["resource_id"],
                "state": "succeeded",
            },
        )


desktop_state_store = DesktopStateStore()
desktop_job_manager = DesktopJobManager(desktop_state_store)
