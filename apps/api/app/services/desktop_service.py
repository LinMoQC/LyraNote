from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.exceptions import BadRequestError, NotFoundError


@dataclass
class WatchFolderRecord:
    id: str
    path: str
    name: str
    created_at: str


class DesktopService:
    def get_runtime_status(self) -> dict:
        return {
            "profile": settings.runtime_profile,
            "health": "ok",
            "database_url": settings.database_url,
            "memory_mode": settings.memory_mode,
            "stdout_events": settings.desktop_stdout_events,
        }

    def list_jobs(self) -> dict:
        return {"items": []}

    def cancel_job(self, job_id: str) -> dict:
        return {
            "cancelled": False,
            "reason": f"Desktop job queue is not enabled for job '{job_id}' yet.",
        }

    def list_watch_folders(self, *, user_id: str) -> dict:
        return {"items": [asdict(item) for item in self._read_watch_folders(user_id=user_id)]}

    def create_watch_folder(self, *, user_id: str, path: str) -> dict:
        normalized_path = str(Path(path).expanduser().resolve())
        folder = Path(normalized_path)
        if not folder.exists():
            raise BadRequestError("目录不存在")
        if not folder.is_dir():
            raise BadRequestError("只能注册目录，不能注册文件")

        items = self._read_watch_folders(user_id=user_id)
        if any(item.path == normalized_path for item in items):
            raise BadRequestError("该目录已注册为监听目录")

        record = WatchFolderRecord(
            id=str(uuid.uuid4()),
            path=normalized_path,
            name=folder.name or normalized_path,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        items.append(record)
        self._write_watch_folders(user_id=user_id, items=items)
        return asdict(record)

    def delete_watch_folder(self, *, user_id: str, folder_id: str) -> None:
        items = self._read_watch_folders(user_id=user_id)
        remaining = [item for item in items if item.id != folder_id]
        if len(remaining) == len(items):
            raise NotFoundError("监听目录不存在")
        self._write_watch_folders(user_id=user_id, items=remaining)

    def _registry_file(self, *, user_id: str) -> Path:
        base = settings.desktop_state_dir / "watch-folders"
        base.mkdir(parents=True, exist_ok=True)
        return base / f"{user_id}.json"

    def _read_watch_folders(self, *, user_id: str) -> list[WatchFolderRecord]:
        path = self._registry_file(user_id=user_id)
        if not path.exists():
            return []

        raw = json.loads(path.read_text(encoding="utf-8"))
        items = raw if isinstance(raw, list) else []
        records: list[WatchFolderRecord] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            try:
                records.append(
                    WatchFolderRecord(
                        id=str(item["id"]),
                        path=str(item["path"]),
                        name=str(item["name"]),
                        created_at=str(item["created_at"]),
                    )
                )
            except KeyError:
                continue
        return records

    def _write_watch_folders(self, *, user_id: str, items: list[WatchFolderRecord]) -> None:
        path = self._registry_file(user_id=user_id)
        payload = [asdict(item) for item in items]
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
