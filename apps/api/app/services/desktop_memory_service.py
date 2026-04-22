from __future__ import annotations

from pathlib import Path

from app.config import settings


class DesktopMemoryService:
    @staticmethod
    def get_runtime_memory_status() -> dict:
        memory_dir = settings.memory_dir.strip()
        resolved_memory_dir = (
            Path(memory_dir).expanduser().resolve()
            if memory_dir
            else (Path.home() / ".lyranote" / "memory").resolve()
        )
        return {
            "memory_mode": settings.memory_mode,
            "memory_dir": str(resolved_memory_dir),
            "is_desktop_runtime": settings.is_desktop_runtime,
        }
