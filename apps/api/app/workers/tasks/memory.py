"""
tasks/memory.py — memory decay, user preference init, diary flush, and portrait synthesis.

Tasks:
  decay_all_user_memories       — beat daily: decay cold memories for all users
  initialize_user_preferences   — post-setup: create welcome notebook + note
  flush_conversation_to_diary   — summarise conversation to diary file
  synthesize_all_user_portraits — beat weekly: synthesise portraits for active users
  synthesize_user_portrait      — synthesise portrait for a single user
"""

from app.config import settings
from app.workers.celery_app import celery_app
from app.workers._helpers import _run_async, _task_db


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
                logger.info(
                    "Memory decay complete: %d items affected across %d users",
                    total_affected, len(user_ids),
                )
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
                    from app.providers.llm import get_client as _get_client
                    client = _get_client()
                    resp = await client.chat.completions.create(
                        model=settings.llm_model or "gpt-4o-mini",
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.7,
                        max_tokens=4000,
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


@celery_app.task(name="synthesize_all_user_portraits", bind=True, max_retries=1)
def synthesize_all_user_portraits(self):
    """
    Celery Beat 每周任务：为所有有足够记忆数据的活跃用户合成用户画像。
    活跃定义：过去 30 天内有对话记录。
    """
    async def _run():
        import logging
        from datetime import datetime, timedelta, timezone
        from sqlalchemy import select
        from app.models import Conversation

        logger = logging.getLogger(__name__)
        from app.agents.portrait.synthesizer import synthesize_portrait
        from app.agents.portrait.loader import invalidate_portrait_cache

        async with _task_db() as db:
            try:
                since = datetime.now(timezone.utc) - timedelta(days=30)
                active_user_ids = (
                    await db.execute(
                        select(Conversation.user_id)
                        .where(Conversation.created_at >= since)
                        .distinct()
                    )
                ).scalars().all()

                success_count = 0
                for user_id in active_user_ids:
                    try:
                        result = await synthesize_portrait(user_id, db)
                        if result:
                            await invalidate_portrait_cache(user_id)
                            success_count += 1
                    except Exception as exc:
                        logger.warning("Portrait synthesis failed for user=%s: %s", user_id, exc)

                logger.info(
                    "Weekly portrait synthesis complete: %d/%d users updated",
                    success_count, len(active_user_ids),
                )
            except Exception as exc:
                raise self.retry(exc=exc, countdown=300)

    _run_async(_run())


@celery_app.task(name="synthesize_user_portrait", bind=True, max_retries=2)
def synthesize_user_portrait(self, user_id: str):
    """
    为单个用户合成用户画像（由对话服务在用户完成 20 次对话后触发）。
    """
    async def _run():
        import uuid
        from app.agents.portrait.synthesizer import synthesize_portrait
        from app.agents.portrait.loader import invalidate_portrait_cache

        async with _task_db() as db:
            try:
                await synthesize_portrait(uuid.UUID(user_id), db)
                await invalidate_portrait_cache(user_id)
            except Exception as exc:
                raise self.retry(exc=exc, countdown=60)

    _run_async(_run())
