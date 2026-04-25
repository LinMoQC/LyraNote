from __future__ import annotations

from uuid import UUID

from app.services.desktop_runtime_service import desktop_job_manager, desktop_state_store


class DesktopAgentService:
    def __init__(self) -> None:
        desktop_job_manager.ensure_started()

    @staticmethod
    def _normalize_user_id(user_id: UUID | str) -> str:
        return str(user_id)

    def list_jobs(self, *, user_id: UUID | str) -> dict:
        return {
            "items": desktop_state_store.list_jobs(
                user_id=self._normalize_user_id(user_id)
            )
        }

    def cancel_job(self, *, user_id: UUID | str, job_id: str) -> dict:
        return desktop_job_manager.cancel_job(
            user_id=self._normalize_user_id(user_id),
            job_id=job_id,
        )
