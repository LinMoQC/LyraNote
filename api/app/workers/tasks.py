"""
Celery task definitions.
Tasks run in a separate process (synchronous context).
Each task creates its own event loop + engine, and explicitly disposes everything
before closing the loop to avoid asyncpg 'Event loop is closed' errors.
"""

import asyncio
from contextlib import asynccontextmanager

from celery import Celery
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

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
    beat_schedule={
        "decay-stale-memories-daily": {
            "task": "decay_all_user_memories",
            "schedule": 86400.0,
        },
        "check-scheduled-tasks": {
            "task": "check_scheduled_tasks",
            "schedule": 60.0,
        },
    },
)


@asynccontextmanager
async def _task_db():
    """
    Async context manager that creates a per-task engine + session,
    then explicitly disposes the engine on exit so no asyncpg connections
    are left dangling when the event loop closes.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        try:
            yield session
        finally:
            pass
    await engine.dispose()


def _run_async(coro):
    """Run an async coroutine in a one-shot event loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        try:
            pending = asyncio.all_tasks(loop)
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.run_until_complete(loop.shutdown_default_executor())
        except Exception:
            pass
        loop.close()


@celery_app.task(name="ingest_source", bind=True, max_retries=3)
def ingest_source(self, source_id: str, chunk_size: int = 512, chunk_overlap: int = 64):
    async def _run():
        from app.agents.rag.ingestion import ingest

        async with _task_db() as db:
            try:
                await ingest(source_id, db, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
                await db.commit()
            except Exception as exc:
                await db.rollback()
                raise self.retry(exc=exc, countdown=30)

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


@celery_app.task(name="generate_notebook_summary", bind=True, max_retries=2)
def generate_notebook_summary(self, notebook_id: str, content_text: str):
    """Generate an AI summary for a notebook from its note text and upsert into notebook_summaries."""
    async def _run():
        import json
        import logging
        from uuid import UUID

        from openai import AsyncOpenAI
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        from app.models import NotebookSummary

        logger = logging.getLogger(__name__)

        if not content_text or len(content_text.strip()) < 50:
            return

        client = AsyncOpenAI(api_key=settings.openai_api_key)
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
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=300,
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


@celery_app.task(name="decay_all_user_memories", bind=True, max_retries=1)
def decay_all_user_memories(self):
    """
    Celery Beat daily task: decay cold memories for all users.
    - Reduces confidence of memories not accessed in 60 days (access_count < 3)
    - Deletes expired fact memories
    - Deletes memories whose confidence drops below 0.2
    """
    async def _run():
        import logging
        from sqlalchemy import select
        from app.models import User
        from app.agents.memory import decay_stale_memories

        logger = logging.getLogger(__name__)
        total_affected = 0

        async with _task_db() as db:
            try:
                result = await db.execute(select(User.id))
                user_ids = [row[0] for row in result.all()]

                for user_id in user_ids:
                    affected = await decay_stale_memories(user_id, db)
                    total_affected += affected

                await db.commit()
                logger.info("Memory decay complete: %d items affected across %d users", total_affected, len(user_ids))
            except Exception as exc:
                await db.rollback()
                raise self.retry(exc=exc, countdown=3600)

    _run_async(_run())


@celery_app.task(name="initialize_user_preferences", bind=True, max_retries=2)
def initialize_user_preferences(
    self,
    user_id: str,
    ai_name: str = "Lyra",
    user_occupation: str = "",
    user_preferences: str = "",
):
    """
    Post-setup async init task:
    1. Create a default global notebook for the user.
    2. Generate & insert a personalized welcome note via LLM.
    """
    async def _run():
        import json
        import logging
        from uuid import UUID

        from openai import AsyncOpenAI
        from sqlalchemy import select

        from app.models import Notebook, Note

        logger = logging.getLogger(__name__)
        uid = UUID(user_id)

        async with _task_db() as db:
            try:
                # ── 1. Create a regular welcome notebook for the user ────────
                result = await db.execute(
                    select(Notebook).where(
                        Notebook.user_id == uid,
                        Notebook.system_type == "welcome",
                    )
                )
                notebook = result.scalar_one_or_none()
                if notebook is None:
                    notebook = Notebook(
                        user_id=uid,
                        title="我的知识库",
                        description="默认笔记本，欢迎开始使用 LyraNote。",
                        is_system=True,
                        system_type="welcome",
                    )
                    db.add(notebook)
                    await db.flush()

                # ── 2. Generate personalized welcome note ────────────────────
                context_parts: list[str] = []
                if user_occupation:
                    context_parts.append(f"职业：{user_occupation}")
                if user_preferences:
                    context_parts.append(f"兴趣偏好：{user_preferences}")
                context_str = "；".join(context_parts) if context_parts else "通用用户"

                prompt = (
                    f"你是 {ai_name}，一位智能笔记助手。请为用户生成一篇个性化的欢迎笔记，"
                    f"用户背景：{context_str}。\n"
                    "要求：\n"
                    "1. 用 Markdown 格式，包含 H2 标题和若干段落\n"
                    "2. 介绍 LyraNote 的核心功能（AI 对话、知识库管理、深度研究）\n"
                    "3. 根据用户背景给出 2-3 条个性化使用建议\n"
                    "4. 语言亲切自然，约 300 字"
                )

                try:
                    client = AsyncOpenAI(
                        api_key=settings.openai_api_key,
                        base_url=settings.openai_base_url or None,
                    )
                    resp = await client.chat.completions.create(
                        model=settings.llm_model or "gpt-4o-mini",
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.7,
                        max_tokens=600,
                    )
                    content_md = resp.choices[0].message.content or ""
                except Exception as llm_err:
                    logger.warning("LLM welcome note generation failed: %s", llm_err)
                    content_md = (
                        f"## 欢迎使用 LyraNote 👋\n\n"
                        f"你好！我是 {ai_name}，你的 AI 笔记助手。\n\n"
                        "**你可以：**\n"
                        "- 在聊天中向我提问，我会帮你整理和分析知识\n"
                        "- 上传文档、网页，构建你的个人知识库\n"
                        "- 发起深度研究，生成结构化报告\n\n"
                        "开始探索吧！"
                    )

                # Convert markdown to Tiptap JSON
                from app.skills.builtin.create_note import _markdown_to_tiptap
                content_json = _markdown_to_tiptap(content_md)

                note = Note(
                    notebook_id=notebook.id,
                    user_id=uid,
                    title=f"欢迎使用 LyraNote · {ai_name} 的开场白",
                    content_json=content_json,
                    content_text=content_md,
                )
                db.add(note)
                await db.commit()
                logger.info("Initialized preferences for user %s", user_id)

            except Exception as exc:
                await db.rollback()
                logger.error("initialize_user_preferences failed: %s", exc)
                raise self.retry(exc=exc, countdown=30)

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


@celery_app.task(name="flush_conversation_to_diary", bind=True, max_retries=2)
def flush_conversation_to_diary(self, conversation_id: str):
    """
    Summarise a conversation and write/append the summary to a dated diary file
    (~/.lyranote/memory/diary/YYYY-MM-DD.md).
    Triggered after a conversation accumulates MEMORY_FLUSH_THRESHOLD messages.
    """
    async def _run():
        import logging
        from uuid import UUID

        from app.agents.memory import flush_conversation_to_diary as _flush

        logger = logging.getLogger(__name__)

        async with _task_db() as db:
            try:
                written = await _flush(UUID(conversation_id), db)
                if written:
                    logger.info("Diary flush completed for conversation %s", conversation_id)
            except Exception as exc:
                logger.error("Diary flush failed for conversation %s: %s", conversation_id, exc)
                raise self.retry(exc=exc, countdown=60)

    _run_async(_run())


@celery_app.task(name="check_scheduled_tasks")
def check_scheduled_tasks():
    """Celery Beat: check for due scheduled tasks and dispatch execution."""
    async def _run():
        import logging
        from datetime import datetime, timezone

        from sqlalchemy import select

        from app.models import ScheduledTask
        from app.utils.cron import next_run_from_cron

        logger = logging.getLogger(__name__)
        now = datetime.now(timezone.utc)

        async with _task_db() as db:
            result = await db.execute(
                select(ScheduledTask).where(
                    ScheduledTask.enabled == True,  # noqa: E712
                    ScheduledTask.next_run_at <= now,
                    ScheduledTask.consecutive_failures < 5,
                )
            )
            due_tasks = result.scalars().all()

            for task in due_tasks:
                next_run = next_run_from_cron(task.schedule_cron, now)
                task.next_run_at = next_run
                await db.flush()
                execute_scheduled_task.delay(str(task.id))
                logger.info("Dispatched scheduled task %s (%s)", task.name, task.id)

            await db.commit()

    _run_async(_run())


async def _fetch_rss_feeds(feed_urls: list[str], max_items: int = 10) -> list[dict]:
    """Fetch and parse RSS/Atom feeds, returning items in the same format as web search results."""
    import logging

    import feedparser
    import httpx

    logger = logging.getLogger(__name__)
    items: list[dict] = []

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        for url in feed_urls:
            try:
                resp = await client.get(url, headers={"User-Agent": "LyraNote/1.0"})
                resp.raise_for_status()
                feed = feedparser.parse(resp.text)
                for entry in feed.entries[:max_items]:
                    summary = entry.get("summary") or entry.get("description") or ""
                    if hasattr(summary, "value"):
                        summary = summary.value
                    from bs4 import BeautifulSoup
                    summary = BeautifulSoup(summary, "html.parser").get_text(strip=True)
                    items.append({
                        "title": entry.get("title", ""),
                        "url": entry.get("link", ""),
                        "content": summary[:1200],
                        "source_feed": feed.feed.get("title", url),
                    })
                    if len(items) >= max_items:
                        break
            except Exception as exc:
                logger.warning("Failed to fetch feed %s: %s", url, exc)
            if len(items) >= max_items:
                break

    return items


@celery_app.task(name="execute_scheduled_task", bind=True, max_retries=2)
def execute_scheduled_task(self, task_id: str):
    """Execute a single scheduled task: search → generate → deliver → update."""
    async def _run():
        import logging
        import time
        from datetime import datetime, timezone
        from uuid import UUID

        from openai import AsyncOpenAI
        from sqlalchemy import select

        from app.config import settings
        from app.models import ScheduledTask, ScheduledTaskRun
        from app.providers import perplexity, tavily

        logger = logging.getLogger(__name__)
        start_time = time.monotonic()

        async with _task_db() as db:
            result = await db.execute(
                select(ScheduledTask).where(ScheduledTask.id == UUID(task_id))
            )
            task = result.scalar_one_or_none()
            if not task or not task.enabled:
                return

            run = ScheduledTaskRun(task_id=task.id, status="running")
            db.add(run)
            await db.flush()

            try:
                params = task.parameters or {}
                topic = params.get("topic", "")
                language = params.get("language", "zh")
                article_style = params.get("article_style", "summary")
                max_sources = params.get("max_sources", 10)
                feed_urls: list[str] = params.get("feed_urls", [])

                all_sources: list[dict] = []

                if feed_urls:
                    all_sources.extend(await _fetch_rss_feeds(feed_urls, max_sources))

                if topic and (not feed_urls or len(all_sources) < max_sources):
                    remaining = max_sources - len(all_sources)
                    if settings.perplexity_api_key:
                        search_results = await perplexity.search(
                            topic, max_results=remaining,
                        )
                    else:
                        search_results = await tavily.search(
                            topic, max_results=remaining,
                            search_depth=params.get("search_depth", "advanced"),
                        )
                    all_sources.extend(search_results or [])

                if not all_sources:
                    raise RuntimeError(f"No results for topic: {topic}")

                sources_text = "\n\n".join(
                    f"[来源{i+1}] {r.get('title', '未知')}\n"
                    f"URL: {r.get('url', '')}\n"
                    f"{r.get('content', '')[:800]}"
                    for i, r in enumerate(all_sources)
                )

                style_instructions = {
                    "summary": "简洁的摘要速览，每条资讯 2-3 句话概括",
                    "detailed": "详细的分析文章，深入解读每个要点",
                    "briefing": "简报格式，要点列表，适合快速浏览",
                }

                client = AsyncOpenAI(
                    api_key=settings.openai_api_key,
                    base_url=settings.openai_base_url or None,
                )

                prompt = (
                    f"你是一位专业的资讯编辑。请根据以下搜索结果，"
                    f"撰写一篇关于「{topic}」的{'中文' if language == 'zh' else 'English'}资讯文章。\n\n"
                    f"**风格要求**：{style_instructions.get(article_style, style_instructions['summary'])}\n\n"
                    f"**格式要求**：\n"
                    f"1. 使用 Markdown 格式\n"
                    f"2. 开头写一段 2-3 句话的总结摘要\n"
                    f"3. 按主题分组，每组有清晰的小标题\n"
                    f"4. 在文末列出所有来源链接\n"
                    f"5. 注明文章生成日期\n\n"
                    f"**搜索结果**：\n{sources_text}"
                )

                resp = await client.chat.completions.create(
                    model=settings.llm_model or "gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.5,
                    max_tokens=2000,
                )
                article_md = resp.choices[0].message.content or ""

                if not article_md:
                    raise RuntimeError("LLM returned empty content")

                delivery = task.delivery_config or {}
                method = delivery.get("method", "email")
                delivery_status = {}
                article_title = f"{task.name} — {datetime.now().strftime('%Y-%m-%d')}"

                if method in ("email", "both"):
                    email_to = delivery.get("email", "")
                    if email_to:
                        from app.providers.email import send_email
                        from app.utils.markdown_email import markdown_to_email_html

                        html = markdown_to_email_html(article_md, article_title)
                        sent = await send_email(
                            to=email_to, subject=article_title,
                            html_body=html, text_body=article_md, db=db,
                        )
                        delivery_status["email"] = "sent" if sent else "failed"
                    else:
                        delivery_status["email"] = "skipped_no_address"

                if method in ("note", "both"):
                    from app.skills.builtin.create_note import _markdown_to_tiptap
                    from app.models import Note, Notebook

                    notebook_id = delivery.get("notebook_id")
                    if not notebook_id:
                        nb_result = await db.execute(
                            select(Notebook.id).where(
                                Notebook.user_id == task.user_id,
                                Notebook.is_system == True,  # noqa: E712
                            ).limit(1)
                        )
                        notebook_id = nb_result.scalar_one_or_none()

                    if notebook_id:
                        note = Note(
                            notebook_id=notebook_id if isinstance(notebook_id, UUID)
                                        else UUID(notebook_id),
                            user_id=task.user_id,
                            title=article_title,
                            content_json=_markdown_to_tiptap(article_md),
                            content_text=article_md,
                        )
                        db.add(note)
                        await db.flush()
                        delivery_status["note"] = "created"
                        delivery_status["note_id"] = str(note.id)
                    else:
                        delivery_status["note"] = "skipped_no_notebook"

                elapsed_ms = int((time.monotonic() - start_time) * 1000)
                run.status = "success"
                run.finished_at = datetime.now(timezone.utc)
                run.duration_ms = elapsed_ms
                run.result_summary = f"生成 {len(article_md)} 字文章，{len(all_sources)} 个来源"
                run.generated_content = article_md
                run.sources_count = len(all_sources)
                run.delivery_status = delivery_status

                task.run_count += 1
                task.last_run_at = datetime.now(timezone.utc)
                task.last_result = run.result_summary
                task.last_error = None
                task.consecutive_failures = 0

                try:
                    from app.models import ProactiveInsight
                    insight = ProactiveInsight(
                        user_id=task.user_id,
                        insight_type="task_completed",
                        title=f"定时任务「{task.name}」执行完成",
                        content=run.result_summary,
                    )
                    db.add(insight)
                except Exception:
                    pass

                await db.commit()
                logger.info("Scheduled task %s executed successfully", task.name)

            except Exception as exc:
                elapsed_ms = int((time.monotonic() - start_time) * 1000)
                run.status = "failed"
                run.finished_at = datetime.now(timezone.utc)
                run.duration_ms = elapsed_ms
                run.error_message = str(exc)

                task.last_error = str(exc)
                task.consecutive_failures += 1

                if task.consecutive_failures >= 5:
                    task.enabled = False
                    task.last_error += " [已自动禁用：连续失败超过5次]"

                await db.commit()
                logger.error("Scheduled task %s failed: %s", task.name, exc)
                raise self.retry(exc=exc, countdown=300)

    _run_async(_run())
