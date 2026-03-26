"""
tasks/notebook.py — notebook summary, note indexing, and artifact generation tasks.

Tasks:
  generate_notebook_summary  — AI summary for a notebook
  index_note                 — embed a user note into vector store
  generate_artifact_task     — generate an artifact (report/outline/etc.)
"""

from app.workers.celery_app import celery_app
from app.workers._helpers import _run_async, _task_db


@celery_app.task(name="generate_notebook_summary", bind=True, max_retries=2)
def generate_notebook_summary(self, notebook_id: str, content_text: str):
    """Generate an AI summary for a notebook from its note text and upsert into notebook_summaries."""
    async def _run():
        import json
        import logging
        from uuid import UUID

        from sqlalchemy.dialects.postgresql import insert as pg_insert

        from app.models import NotebookSummary

        logger = logging.getLogger(__name__)

        if not content_text or len(content_text.strip()) < 50:
            return

        from app.providers.llm import get_utility_client, get_utility_model
        client = get_utility_client()
        prompt = (
            "你是一位专业的笔记助手。请根据以下笔记内容，用中文生成：\n"
            "1. 一段 2-3 句话的简明摘要（summary_md）\n"
            "2. 3-5 个核心主题关键词列表（key_themes）\n\n"
            "请严格以 JSON 格式返回，格式为：\n"
            '{"summary_md": "...", "key_themes": ["主题1", "主题2", ...]}\n\n'
            f"笔记内容（最多 3000 字）：\n{content_text[:3000]}"
        )

        try:
            resp = await client.chat.completions.create(
                model=get_utility_model(),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=500,
                response_format={"type": "json_object"},
            )
            raw = resp.choices[0].message.content or "{}"
            data = json.loads(raw)
            summary_md = data.get("summary_md") or ""
            key_themes = data.get("key_themes") or []
        except Exception as exc:
            logger.error("Summary generation failed for notebook %s: %s", notebook_id, exc)
            raise self.retry(exc=exc, countdown=60)

        async with _task_db() as db:
            try:
                stmt = pg_insert(NotebookSummary).values(
                    notebook_id=UUID(notebook_id),
                    summary_md=summary_md,
                    key_themes=key_themes,
                ).on_conflict_do_update(
                    index_elements=["notebook_id"],
                    set_={"summary_md": summary_md, "key_themes": key_themes},
                )
                await db.execute(stmt)
                await db.commit()
            except Exception as exc:
                await db.rollback()
                raise self.retry(exc=exc, countdown=60)

    _run_async(_run())


@celery_app.task(name="index_note", bind=True, max_retries=2)
def index_note(self, note_id: str):
    """Index a user note into the knowledge base as note-type chunks."""
    async def _run():
        import hashlib
        import logging
        from uuid import UUID

        from sqlalchemy import select

        from app.agents.rag.ingestion import _chunk_text
        from app.models import Chunk, Note
        from app.providers.embedding import embed_texts

        logger = logging.getLogger(__name__)

        async with _task_db() as db:
            try:
                result = await db.execute(select(Note).where(Note.id == UUID(note_id)))
                note = result.scalar_one_or_none()
                if note is None:
                    return

                content = note.content_text or ""
                if len(content.strip()) < 50:
                    return

                content_hash = hashlib.md5(content.encode()).hexdigest()
                if note.last_indexed_hash == content_hash:
                    return

                chunks = _chunk_text(content, chunk_size=256, chunk_overlap=32)

                batch_size = 100
                all_embeddings: list[list[float]] = []
                for i in range(0, len(chunks), batch_size):
                    batch = chunks[i : i + batch_size]
                    vecs = await embed_texts(batch)
                    all_embeddings.extend(vecs)

                existing = await db.execute(
                    select(Chunk).where(Chunk.source_type == "note", Chunk.note_id == note.id)
                )
                for c in existing.scalars().all():
                    await db.delete(c)
                await db.flush()

                for idx, (text_chunk, vec) in enumerate(zip(chunks, all_embeddings)):
                    chunk = Chunk(
                        source_id=None,
                        notebook_id=note.notebook_id,
                        content=text_chunk,
                        chunk_index=idx,
                        embedding=vec,
                        token_count=len(text_chunk.split()),
                        source_type="note",
                        note_id=note.id,
                        metadata_={"note_title": note.title or ""},
                    )
                    db.add(chunk)

                note.last_indexed_hash = content_hash
                await db.commit()
                logger.info("Indexed note %s: %d chunks", note_id, len(chunks))

            except Exception as exc:
                await db.rollback()
                logger.error("index_note failed for %s: %s", note_id, exc)
                raise self.retry(exc=exc, countdown=60)

    _run_async(_run())


@celery_app.task(name="generate_artifact", bind=True, max_retries=3)
def generate_artifact_task(self, artifact_id: str):
    async def _run():
        from uuid import UUID

        from sqlalchemy import select

        from app.agents.writing.composer import generate_artifact
        from app.models import Artifact, Chunk, Source

        async with _task_db() as db:
            try:
                result = await db.execute(
                    select(Artifact).where(Artifact.id == UUID(artifact_id))
                )
                artifact = result.scalar_one_or_none()
                if artifact is None:
                    return

                chunk_result = await db.execute(
                    select(Chunk, Source.title.label("source_title"))
                    .join(Source, Chunk.source_id == Source.id)
                    .where(
                        Chunk.notebook_id == artifact.notebook_id,
                        Source.status == "indexed",
                    )
                    .limit(30)
                )
                rows = chunk_result.all()
                chunks = [
                    {
                        "chunk_id": str(row[0].id),
                        "source_id": str(row[0].source_id),
                        "source_title": row[1] or "未知来源",
                        "excerpt": row[0].content[:300],
                        "content": row[0].content,
                        "score": 1.0,
                    }
                    for row in rows
                ]

                content_md = await generate_artifact(artifact.type, chunks)
                artifact.content_md = content_md
                artifact.status = "ready"
                await db.commit()

            except Exception as exc:
                await db.rollback()
                async with _task_db() as db2:
                    result2 = await db2.execute(
                        select(Artifact).where(Artifact.id == UUID(artifact_id))
                    )
                    art = result2.scalar_one_or_none()
                    if art:
                        art.status = "failed"
                        await db2.commit()
                raise self.retry(exc=exc, countdown=30)

    _run_async(_run())
