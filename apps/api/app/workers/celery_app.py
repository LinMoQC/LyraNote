"""
Celery application instance, configuration, and signal hooks.
Import this module to get the configured celery_app, or use:
    celery -A app.workers.celery_app.celery_app worker
"""

from celery import Celery
from celery.schedules import crontab
from kombu import Queue

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
    task_default_queue="celery",
    task_default_exchange="celery",
    task_default_routing_key="celery",
    task_create_missing_queues=True,
    task_queues=(
        Queue("celery"),
        Queue("ingestion"),
        Queue("scheduled"),
        Queue("maintenance"),
    ),
    task_routes={
        "ingest_source": {"queue": "ingestion"},
        "extract_knowledge_graph": {"queue": "maintenance"},
        "rebuild_knowledge_graph": {"queue": "maintenance"},
        "index_note": {"queue": "ingestion"},
        "postprocess_indexed_source": {"queue": "maintenance"},
        "execute_scheduled_task": {"queue": "scheduled"},
        "check_scheduled_tasks": {"queue": "maintenance"},
        "expire_stuck_sources": {"queue": "maintenance"},
        "precompute_ai_suggestions": {"queue": "maintenance"},
        "decay_all_user_memories": {"queue": "maintenance"},
        "synthesize_all_user_portraits": {"queue": "maintenance"},
        "cleanup_observability": {"queue": "maintenance"},
    },
    beat_schedule={
        "decay-stale-memories-daily": {
            "task": "decay_all_user_memories",
            "schedule": 86400.0,
            "options": {"queue": "maintenance"},
        },
        "check-scheduled-tasks": {
            "task": "check_scheduled_tasks",
            "schedule": 60.0,
            "options": {"queue": "maintenance"},
        },
        "weekly-portrait-synthesis": {
            "task": "synthesize_all_user_portraits",
            "schedule": crontab(hour=3, day_of_week=1),  # Every Monday at 03:00 UTC
            "options": {"queue": "maintenance"},
        },
        "expire-stuck-sources": {
            "task": "expire_stuck_sources",
            "schedule": 600.0,  # every 10 minutes
            "options": {"queue": "maintenance"},
        },
        "precompute-ai-suggestions": {
            "task": "precompute_ai_suggestions",
            "schedule": 600.0,  # every 10 minutes
            "options": {"queue": "maintenance"},
        },
        "cleanup-observability-daily": {
            "task": "cleanup_observability",
            "schedule": crontab(hour=4, minute=0),
            "options": {"queue": "maintenance"},
        },
    },
)

from celery.signals import after_setup_logger, beat_init, worker_process_init  # noqa: E402

_heartbeat_threads: dict[str, object] = {}


def _start_heartbeat_thread(component: str) -> None:
    if not settings.monitoring_enabled or component in _heartbeat_threads:
        return

    import threading
    import time

    from app.services.monitoring_service import touch_worker_heartbeat
    from app.workers._helpers import _run_async

    def _runner() -> None:
        interval = max(5, settings.monitoring_heartbeat_interval_seconds)
        while True:
            try:
                _run_async(touch_worker_heartbeat(component))
            except Exception:
                import logging

                logging.getLogger(__name__).exception("Failed to update %s heartbeat", component)
            time.sleep(interval)

    thread = threading.Thread(target=_runner, name=f"heartbeat-{component}", daemon=True)
    thread.start()
    _heartbeat_threads[component] = thread


@after_setup_logger.connect
def _on_setup_logger(**_kwargs):
    """Override Celery's default logging with our unified formatter."""
    from app.logging_config import setup_logging
    setup_logging(debug=settings.debug, logs_dir=settings.logs_dir)


@worker_process_init.connect
def _on_worker_init(**_kwargs):
    """Runs in each forked worker process: load DB config (API keys etc.)."""
    from app.logging_config import setup_logging
    from app.workers._helpers import _load_db_settings_sync
    setup_logging(debug=settings.debug, logs_dir=settings.logs_dir)
    _load_db_settings_sync()
    _start_heartbeat_thread("worker")


@beat_init.connect
def _on_beat_init(**_kwargs):
    from app.logging_config import setup_logging
    from app.workers._helpers import _load_db_settings_sync

    setup_logging(debug=settings.debug, logs_dir=settings.logs_dir)
    _load_db_settings_sync()
    _start_heartbeat_thread("beat")
