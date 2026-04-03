from __future__ import annotations

from app.services.monitoring_service import cleanup_observability_data
from app.workers._helpers import _run_async, _task_db
from app.workers.celery_app import celery_app


@celery_app.task(name="cleanup_observability")
def cleanup_observability():
    async def _run():
        import logging

        logger = logging.getLogger(__name__)
        async with _task_db() as db:
            result = await cleanup_observability_data(db)
            await db.commit()
            logger.info("Observability cleanup completed", extra=result)

    _run_async(_run())
