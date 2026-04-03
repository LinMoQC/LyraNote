"""
tasks/scheduler.py — user-defined scheduled task execution.

Tasks:
  check_scheduled_tasks    — beat 60s: find due tasks and dispatch them
  execute_scheduled_task   — run a single scheduled task end-to-end

Helpers:
  _fetch_rss_feeds         — fetch and parse RSS/Atom feeds
"""

from app.config import settings
from app.services.monitoring_service import (
    bind_trace_and_run,
    create_observability_run,
    finish_observability_run,
    reset_trace_and_run,
    traced_span,
)
from app.trace import generate_trace_id
from app.workers.celery_app import celery_app
from app.workers._helpers import _run_async, _task_db


def summarize_delivery_outcome(delivery_status: dict[str, object]) -> tuple[str | None, str | None]:
    """Build user-facing delivery summary and error message from per-channel results."""
    summary_parts: list[str] = []
    issue_parts: list[str] = []

    email_status = delivery_status.get("email")
    email_error = delivery_status.get("email_error")
    note_status = delivery_status.get("note")

    if email_status == "sent":
        summary_parts.append("邮件已发送")
    elif email_status == "failed":
        summary_parts.append("邮件发送失败")
        detail = str(email_error).strip() if email_error else "请检查 SMTP 配置"
        issue_parts.append(f"邮件投递失败：{detail}")
    elif email_status == "skipped_no_address":
        summary_parts.append("缺少收件邮箱")
        issue_parts.append("邮件投递失败：未配置收件邮箱")

    if note_status == "created":
        summary_parts.append("已写入笔记")
    elif note_status == "skipped_no_notebook":
        summary_parts.append("未找到笔记本")
        issue_parts.append("笔记投递失败：未找到可写入的系统笔记本")

    summary = "，".join(summary_parts) if summary_parts else None
    issues = "；".join(issue_parts) if issue_parts else None
    return summary, issues


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
                execute_scheduled_task.delay(str(task.id), None)
                logger.info("Dispatched scheduled task %s (%s)", task.name, task.id)

            await db.commit()

    _run_async(_run())


@celery_app.task(name="execute_scheduled_task", bind=True, max_retries=2)
def execute_scheduled_task(self, task_id: str, trace_id: str | None = None):
    """Execute a single scheduled task: search → generate → deliver → update."""
    async def _run():
        import logging
        import time
        from datetime import datetime, timezone
        from uuid import UUID

        from sqlalchemy import select

        from app.models import ScheduledTask, ScheduledTaskRun
        from app.providers import perplexity, tavily

        logger = logging.getLogger(__name__)
        start_time = time.monotonic()

        async with _task_db() as db:
            observability_run = None
            trace_token = None
            run_token = None
            task = None
            run = None
            try:
                result = await db.execute(
                    select(ScheduledTask).where(ScheduledTask.id == UUID(task_id))
                )
                task = result.scalar_one_or_none()
                if not task or not task.enabled:
                    return

                run = ScheduledTaskRun(task_id=task.id, status="running")
                db.add(run)
                await db.flush()

                observability_run = await create_observability_run(
                    db,
                    trace_id=trace_id or generate_trace_id(),
                    run_type="scheduled_task_run",
                    name="scheduled.task.run",
                    status="running",
                    user_id=task.user_id,
                    task_id=task.id,
                    task_run_id=run.id,
                    metadata={"task_name": task.name},
                )
                trace_token, run_token = bind_trace_and_run(observability_run.trace_id, observability_run.id)

                async with traced_span(db, "scheduled.fetch_task", run=observability_run):
                    result = await db.execute(
                        select(ScheduledTask).where(ScheduledTask.id == UUID(task_id))
                    )
                    task = result.scalar_one_or_none()
                    if not task or not task.enabled:
                        return

                params = task.parameters or {}
                topic = params.get("topic", "")
                language = params.get("language", "zh")
                article_style = params.get("article_style", "summary")
                max_sources = params.get("max_sources", 10)
                feed_urls: list[str] = params.get("feed_urls", [])

                all_sources: list[dict] = []

                async with traced_span(db, "scheduled.generate", run=observability_run):
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

                    from app.providers.llm import get_client as _get_llm_client
                    client = _get_llm_client()

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
                        max_tokens=6000,
                    )
                    article_md = resp.choices[0].message.content or ""

                    if not article_md:
                        raise RuntimeError("LLM returned empty content")

                delivery = task.delivery_config or {}
                method = delivery.get("method", "email")
                delivery_status = {}
                article_title = f"{task.name} — {datetime.now().strftime('%Y-%m-%d')}"

                async with traced_span(db, "scheduled.deliver", run=observability_run):
                    if method in ("email", "both"):
                        email_to = delivery.get("email", "")
                        if email_to:
                            from app.providers.email import send_email
                            from app.utils.markdown_email import markdown_to_email_html

                            html = markdown_to_email_html(article_md, article_title)
                            email_result = await send_email(
                                to=email_to, subject=article_title,
                                html_body=html, text_body=article_md, db=db,
                            )
                            delivery_status["email"] = "sent" if email_result.ok else "failed"
                            if email_result.error:
                                delivery_status["email_error"] = email_result.error
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
                delivery_summary, delivery_issues = summarize_delivery_outcome(delivery_status)
                result_summary = f"生成 {len(article_md)} 字文章，{len(all_sources)} 个来源"
                if delivery_summary:
                    result_summary = f"{result_summary}，{delivery_summary}"

                async with traced_span(db, "scheduled.finalize", run=observability_run):
                    run.status = "success"
                    run.finished_at = datetime.now(timezone.utc)
                    run.duration_ms = elapsed_ms
                    run.result_summary = result_summary
                    run.error_message = delivery_issues
                    run.generated_content = article_md
                    run.sources_count = len(all_sources)
                    run.delivery_status = delivery_status

                    task.run_count += 1
                    task.last_run_at = datetime.now(timezone.utc)
                    task.last_result = result_summary
                    task.last_error = delivery_issues
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

                    if observability_run is not None:
                        await finish_observability_run(
                            db,
                            observability_run,
                            status="success",
                            metadata={
                                "task_name": task.name,
                                "sources_count": len(all_sources),
                                "delivery_status": delivery_status,
                            },
                            error_message=delivery_issues,
                        )

                    await db.commit()
                if delivery_issues:
                    logger.warning(
                        "Scheduled task %s completed with delivery issues: %s",
                        task.name,
                        delivery_issues,
                    )
                else:
                    logger.info("Scheduled task %s executed successfully", task.name)

            except Exception as exc:
                elapsed_ms = int((time.monotonic() - start_time) * 1000)
                if run is not None:
                    run.status = "failed"
                    run.finished_at = datetime.now(timezone.utc)
                    run.duration_ms = elapsed_ms
                    run.error_message = str(exc)

                if task is not None:
                    task.last_error = str(exc)
                    task.consecutive_failures += 1

                    if task.consecutive_failures >= 5:
                        task.enabled = False
                        task.last_error += " [已自动禁用：连续失败超过5次]"

                if observability_run is not None:
                    await finish_observability_run(
                        db,
                        observability_run,
                        status="failed",
                        metadata={"task_name": task.name},
                        error_message=str(exc),
                    )
                await db.commit()
                logger.error("Scheduled task %s failed: %s", task.name, exc)
                raise self.retry(exc=exc, countdown=300)
            finally:
                if trace_token is not None and run_token is not None:
                    reset_trace_and_run(trace_token, run_token)

    _run_async(_run())
