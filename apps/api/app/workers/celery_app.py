"""
Celery application instance, configuration, and signal hooks.
Import this module to get the configured celery_app, or use:
    celery -A app.workers.celery_app.celery_app worker
"""

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "lyranote",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_hijack_root_logger=False,
    beat_schedule={
        "decay-stale-memories-daily": {
            "task": "decay_all_user_memories",
            "schedule": 86400.0,
        },
        "check-scheduled-tasks": {
            "task": "check_scheduled_tasks",
            "schedule": 60.0,
        },
        "weekly-portrait-synthesis": {
            "task": "synthesize_all_user_portraits",
            "schedule": crontab(hour=3, day_of_week=1),  # Every Monday at 03:00 UTC
        },
        "expire-stuck-sources": {
            "task": "expire_stuck_sources",
            "schedule": 600.0,  # every 10 minutes
        },
    },
)

from celery.signals import after_setup_logger, worker_process_init  # noqa: E402


@after_setup_logger.connect
def _on_setup_logger(**_kwargs):
    """Override Celery's default logging with our unified formatter."""
    from app.logging_config import setup_logging
    setup_logging(debug=settings.debug)


@worker_process_init.connect
def _on_worker_init(**_kwargs):
    """Runs in each forked worker process: load DB config (API keys etc.)."""
    from app.logging_config import setup_logging
    from app.workers._helpers import _load_db_settings_sync
    setup_logging(debug=settings.debug)
    _load_db_settings_sync()
