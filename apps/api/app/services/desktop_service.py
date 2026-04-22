from __future__ import annotations

from uuid import UUID

from app.config import settings
from app.services.desktop_agent_service import DesktopAgentService
from app.services.desktop_knowledge_service import DesktopKnowledgeService
from app.services.desktop_memory_service import DesktopMemoryService


class DesktopService:
    def __init__(self) -> None:
        self.agent_service = DesktopAgentService()
        self.memory_service = DesktopMemoryService()

    def get_runtime_status(self) -> dict:
        memory_status = self.memory_service.get_runtime_memory_status()
        return {
            "profile": settings.runtime_profile,
            "health": "ok",
            "database_url": settings.database_url,
            "memory_mode": memory_status["memory_mode"],
            "memory_dir": memory_status["memory_dir"],
            "stdout_events": settings.desktop_stdout_events,
        }

    def list_jobs(self, *, user_id: str) -> dict:
        return self.agent_service.list_jobs(user_id=user_id)

    def cancel_job(self, *, user_id: str, job_id: str) -> dict:
        return self.agent_service.cancel_job(user_id=user_id, job_id=job_id)

    def _knowledge_service(self, user_id: str) -> DesktopKnowledgeService:
        return DesktopKnowledgeService(None, UUID(user_id))

    def list_watch_folders(self, *, user_id: str) -> dict:
        return self._knowledge_service(user_id).list_watch_folders()

    def list_recent_imports(self, *, user_id: str) -> dict:
        return self._knowledge_service(user_id).list_recent_imports()

    def inspect_local_file(
        self,
        *,
        user_id: str,
        path: str,
        sha256: str | None = None,
    ) -> dict:
        return self._knowledge_service(user_id).inspect_local_file(path=path, sha256=sha256)

    def create_watch_folder(self, *, user_id: str, path: str) -> dict:
        return self._knowledge_service(user_id).create_watch_folder(path=path)

    def delete_watch_folder(self, *, user_id: str, folder_id: str) -> None:
        self._knowledge_service(user_id).delete_watch_folder(folder_id=folder_id)

    async def import_watch_folder_path(self, *, user_id: str, path: str) -> dict:
        return await self._knowledge_service(user_id).import_watch_folder_path(path=path)
