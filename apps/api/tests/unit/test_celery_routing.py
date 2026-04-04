from app.workers.celery_app import celery_app


def test_celery_routes_separate_ingestion_and_maintenance_queues() -> None:
    routes = celery_app.conf.task_routes

    assert routes["ingest_source"]["queue"] == "ingestion"
    assert routes["extract_knowledge_graph"]["queue"] == "maintenance"
    assert routes["rebuild_knowledge_graph"]["queue"] == "maintenance"
    assert routes["index_note"]["queue"] == "ingestion"
    assert routes["postprocess_indexed_source"]["queue"] == "maintenance"
    assert routes["execute_scheduled_task"]["queue"] == "scheduled"
    assert routes["check_scheduled_tasks"]["queue"] == "maintenance"
    assert routes["precompute_ai_suggestions"]["queue"] == "maintenance"


def test_beat_maintenance_jobs_are_routed_off_main_queue() -> None:
    beat_schedule = celery_app.conf.beat_schedule

    assert beat_schedule["check-scheduled-tasks"]["options"]["queue"] == "maintenance"
    assert beat_schedule["expire-stuck-sources"]["options"]["queue"] == "maintenance"
    assert beat_schedule["precompute-ai-suggestions"]["options"]["queue"] == "maintenance"
