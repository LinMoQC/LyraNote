"""
tasks/suggestions.py — periodic precomputation for /ai/suggestions.

Tasks:
  precompute_ai_suggestions — beat periodic job: refresh cached suggestions for active users
"""

from app.workers._helpers import _run_async, _task_db
from app.workers.celery_app import celery_app


@celery_app.task(name="precompute_ai_suggestions", bind=True, max_retries=1)
def precompute_ai_suggestions(self):
    """Celery Beat task: precompute ai suggestions in cache for active users."""

    async def _run():
        import logging

        from app.services.suggestion_service import SuggestionService

        logger = logging.getLogger(__name__)

        async with _task_db() as db:
            try:
                stats = await SuggestionService(db).refresh_active_user_suggestions()
                logger.info(
                    "precompute_ai_suggestions done: active=%d generated=%d skipped=%d failed=%d",
                    stats["active_users"],
                    stats["generated"],
                    stats["skipped"],
                    stats["failed"],
                )
            except Exception as exc:
                logger.exception("precompute_ai_suggestions failed")
                raise self.retry(exc=exc, countdown=300)

    _run_async(_run())
