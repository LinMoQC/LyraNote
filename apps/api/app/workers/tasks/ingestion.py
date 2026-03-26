"""
tasks/ingestion.py — source ingestion and knowledge graph tasks.

Tasks:
  ingest_source              — chunk and embed a source document
  expire_stuck_sources       — beat: mark timed-out sources as failed
  extract_knowledge_graph    — extract entities/relations from a source
  rebuild_knowledge_graph_task — rebuild full KG for a notebook
"""

from app.config import settings
from app.workers.celery_app import celery_app
from app.workers._helpers import _run_async, _task_db


@celery_app.task(
    name="ingest_source",
    bind=True,
    max_retries=3,
    soft_time_limit=300,
    time_limit=360,
)
def ingest_source(
    self,
    source_id: str,
    chunk_size: int = 512,
    chunk_overlap: int = 64,
    splitter_type: str = "auto",
    separators: list | None = None,
    min_chunk_size: int = 50,
):
    async def _run():
        from app.agents.rag.ingestion import ingest

        async with _task_db() as db:
            try:
                await ingest(
                    source_id,
                    db,
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                    splitter_type=splitter_type,
                    separators=separators,
                    min_chunk_size=min_chunk_size,
                )
                await db.commit()
            except Exception as exc:
                await db.rollback()
                # On SoftTimeLimitExceeded, mark the source as failed immediately
                # instead of retrying (retrying a timed-out task rarely helps)
                try:
                    from billiard.exceptions import SoftTimeLimitExceeded as _STLE
                    if isinstance(exc, _STLE):
                        from uuid import UUID
                        from sqlalchemy import select
                        from app.models import Source as SourceModel
                        async with _task_db() as db2:
                            res = await db2.execute(
                                select(SourceModel).where(SourceModel.id == UUID(source_id))
                            )
                            src = res.scalar_one_or_none()
                            if src:
                                src.status = "failed"
                                src.metadata_ = {**(src.metadata_ or {}), "error": "indexing_timeout"}
                            await db2.commit()
                        return
                except Exception:
                    pass
                raise self.retry(exc=exc, countdown=30)

    _run_async(_run())


@celery_app.task(name="expire_stuck_sources")
def expire_stuck_sources():
    """
    Celery Beat task (every 10 min): find sources stuck in 'processing' or 'pending'
    for more than 15 minutes and mark them as 'failed'.
    """
    async def _run():
        import logging
        from datetime import datetime, timedelta, timezone
        from sqlalchemy import select
        from app.models import Source as SourceModel

        logger = logging.getLogger(__name__)
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)

        async with _task_db() as db:
            result = await db.execute(
                select(SourceModel).where(
                    SourceModel.status.in_(["processing", "pending"]),
                    SourceModel.updated_at < cutoff,
                )
            )
            stuck = result.scalars().all()
            if stuck:
                for src in stuck:
                    src.status = "failed"
                    src.metadata_ = {**(src.metadata_ or {}), "error": "indexing_timeout"}
                await db.commit()
                logger.warning(
                    "expire_stuck_sources: marked %d sources as failed (timeout)", len(stuck)
                )

    _run_async(_run())


@celery_app.task(name="extract_knowledge_graph", bind=True, max_retries=2)
def extract_knowledge_graph(self, source_id: str):
    """Extract knowledge entities and relations from a source after ingestion."""
    async def _run():
        from app.agents.kg.knowledge_graph import extract_entities_and_relations

        async with _task_db() as db:
            try:
                await extract_entities_and_relations(source_id, db)
                await db.commit()
            except Exception as exc:
                await db.rollback()
                raise self.retry(exc=exc, countdown=30)

    _run_async(_run())


@celery_app.task(name="rebuild_knowledge_graph", bind=True, max_retries=1)
def rebuild_knowledge_graph_task(self, notebook_id: str, user_id: str | None = None):
    """Rebuild the full knowledge graph for a notebook."""
    import json as _json
    import redis as _redis

    r = _redis.from_url(settings.redis_url, decode_responses=True) if user_id else None
    progress_key = f"kg:rebuild_progress:{user_id}" if user_id else None

    def on_progress(current: int, total: int, source_title: str):
        if not r or not progress_key:
            return
        if current > 0:
            done = r.incr(f"{progress_key}:done")
        else:
            done = int(r.get(f"{progress_key}:done") or 0)
        total_all = int(r.get(f"{progress_key}:total") or total)
        r.set(
            progress_key,
            _json.dumps({
                "current": int(done),
                "total": total_all,
                "source_title": source_title,
                "status": "done" if int(done) >= total_all else "processing",
            }),
            ex=300,
        )

    async def _run():
        from app.agents.kg.knowledge_graph import rebuild_notebook_graph

        async with _task_db() as db:
            try:
                await rebuild_notebook_graph(notebook_id, db, on_progress=on_progress)
                await db.commit()
            except Exception as exc:
                await db.rollback()
                raise self.retry(exc=exc, countdown=60)

    _run_async(_run())
