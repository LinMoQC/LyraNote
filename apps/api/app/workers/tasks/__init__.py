"""
app.workers.tasks — public re-export surface.

All existing imports of the form:
    from app.workers.tasks import ingest_source
    from app.workers.tasks import celery_app
continue to work unchanged. docker-compose / CLI that reference
`app.workers.tasks.celery_app` also work without any modification.
"""

# Re-export celery_app so `celery -A app.workers.tasks.celery_app` works
from app.workers.celery_app import celery_app  # noqa: F401

# Import all task modules so Celery discovers every task on startup
from app.workers.tasks.ingestion import (  # noqa: F401
    extract_knowledge_graph,
    expire_stuck_sources,
    ingest_source,
    rebuild_knowledge_graph_task,
)
from app.workers.tasks.memory import (  # noqa: F401
    decay_all_user_memories,
    flush_conversation_to_diary,
    initialize_user_preferences,
    synthesize_all_user_portraits,
    synthesize_user_portrait,
)
from app.workers.tasks.notebook import (  # noqa: F401
    generate_artifact_task,
    generate_notebook_summary,
    index_note,
)
from app.workers.tasks.scheduler import (  # noqa: F401
    check_scheduled_tasks,
    execute_scheduled_task,
)
