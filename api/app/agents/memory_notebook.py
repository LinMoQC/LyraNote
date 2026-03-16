"""
Notebook Summary, Conversation Compression, Diary, and Memory Doc.

Exports:
  get_notebook_summary()
  refresh_notebook_summary()
  compress_conversation()
  get_conversation_summary()
  flush_conversation_to_diary()
  get_recent_diary_notes()
  get_memory_doc_content()
  write_memory_doc_content()
  COMPRESS_TRIGGER, RAW_HISTORY_WINDOW
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConversationSummary, Message, NotebookSummary, Source

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Notebook Summary
# ---------------------------------------------------------------------------

NOTEBOOK_SUMMARY_PROMPT = """
以下是一个研究笔记本中所有已索引来源的摘要。
请综合这些摘要，完成两件事：
1. 用 2-4 句话描述这个笔记本整体在研究什么（中文，Markdown 格式）
2. 列出 3-6 个核心主题关键词（中文短语）

以 JSON 格式返回：
{{"summary_md": "...", "key_themes": ["主题A", "主题B", ...]}}

来源摘要列表：
{source_summaries}
""".strip()


async def get_notebook_summary(notebook_id: UUID, db: AsyncSession) -> dict | None:
    """Return the current NotebookSummary as a dict, or None if not yet generated."""
    result = await db.execute(
        select(NotebookSummary).where(NotebookSummary.notebook_id == notebook_id)
    )
    ns = result.scalar_one_or_none()
    if ns is None:
        return None
    return {
        "summary_md": ns.summary_md or "",
        "key_themes": ns.key_themes or [],
    }


async def refresh_notebook_summary(notebook_id: UUID, db: AsyncSession) -> None:
    """
    Called after a Source is successfully indexed or a Note is created/updated.
    Aggregates all indexed source summaries and regenerates the NotebookSummary.
    """
    from app.providers.llm import chat

    result = await db.execute(
        select(Source.title, Source.summary)
        .where(Source.notebook_id == notebook_id, Source.status == "indexed")
    )
    rows = result.all()
    if not rows:
        return

    source_summaries = "\n".join(
        f"- 《{r.title or '未知来源'}》：{r.summary or '（无摘要）'}"
        for r in rows
    )

    try:
        raw = await chat(
            [
                {"role": "system", "content": "你是一个研究助手，只输出 JSON。"},
                {
                    "role": "user",
                    "content": NOTEBOOK_SUMMARY_PROMPT.format(source_summaries=source_summaries),
                },
            ],
            temperature=0.3,
        )
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        data: dict = json.loads(raw)
        summary_md: str = data.get("summary_md", "")
        key_themes: list = data.get("key_themes", [])
    except Exception as exc:
        logger.warning("Notebook summary refresh failed for %s: %s", notebook_id, exc)
        return

    existing_ns = (
        await db.execute(
            select(NotebookSummary).where(NotebookSummary.notebook_id == notebook_id)
        )
    ).scalar_one_or_none()

    if existing_ns:
        existing_ns.summary_md = summary_md
        existing_ns.key_themes = key_themes
        existing_ns.last_synced_at = datetime.now(timezone.utc)
    else:
        db.add(NotebookSummary(
            notebook_id=notebook_id,
            summary_md=summary_md,
            key_themes=key_themes,
            last_synced_at=datetime.now(timezone.utc),
        ))
    await db.flush()
    logger.info("Refreshed notebook summary for %s (%d themes)", notebook_id, len(key_themes))


# ---------------------------------------------------------------------------
# Conversation Summary Compression
# ---------------------------------------------------------------------------

COMPRESS_TRIGGER = 20
RAW_HISTORY_WINDOW = 10

COMPRESSION_PROMPT = """
你是一个对话压缩助手。
请将以下对话历史压缩为一段简洁的中文摘要（200字以内），保留关键信息：
- 用户讨论的核心主题和问题
- AI 给出的重要结论或建议
- 用户明确表达的偏好或决定
- 未解决的问题或待办事项

对话历史：
{conversation}

只输出摘要文本，不要加标题或额外格式。
""".strip()


async def compress_conversation(conversation_id: UUID, db: AsyncSession) -> bool:
    """
    Compress old messages in a conversation into a rolling summary.
    Returns True if compression was performed, False if skipped.
    """
    from app.providers.llm import chat

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    all_messages = result.scalars().all()

    if len(all_messages) <= COMPRESS_TRIGGER:
        return False

    to_compress = all_messages[:-RAW_HISTORY_WINDOW]

    existing = (
        await db.execute(
            select(ConversationSummary).where(
                ConversationSummary.conversation_id == conversation_id
            )
        )
    ).scalar_one_or_none()

    already_compressed_count = existing.compressed_message_count if existing else 0

    new_messages = to_compress[already_compressed_count:]
    if not new_messages:
        logger.debug("Conversation %s: nothing new to compress", conversation_id)
        return False

    new_conv_text = "\n".join(
        f"{'用户' if m.role == 'user' else 'AI'}: {m.content[:500]}"
        for m in new_messages
    )

    if existing and existing.summary_text:
        merge_instruction = (
            f"现有摘要（请在此基础上补充新信息，不要重复）：\n{existing.summary_text}\n\n"
            f"新增对话：\n{new_conv_text}"
        )
    else:
        merge_instruction = new_conv_text

    try:
        summary_text = await chat(
            [
                {"role": "system", "content": "你是一个对话压缩助手，只输出摘要文本。"},
                {
                    "role": "user",
                    "content": COMPRESSION_PROMPT.format(conversation=merge_instruction),
                },
            ],
            temperature=0.2,
        )
        summary_text = summary_text.strip()
    except Exception as exc:
        logger.warning("Conversation compression failed for %s: %s", conversation_id, exc)
        return False

    boundary_message = to_compress[-1]

    if existing:
        existing.summary_text = summary_text
        existing.compressed_message_count = len(to_compress)
        existing.compressed_through = boundary_message.created_at
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(ConversationSummary(
            conversation_id=conversation_id,
            summary_text=summary_text,
            compressed_message_count=len(to_compress),
            compressed_through=boundary_message.created_at,
        ))

    await db.flush()
    logger.info(
        "Compressed conversation %s: %d → %d messages covered (added %d new)",
        conversation_id,
        already_compressed_count,
        len(to_compress),
        len(new_messages),
    )
    return True


async def get_conversation_summary(
    conversation_id: UUID, db: AsyncSession
) -> str | None:
    """Return the compressed summary text for a conversation, or None."""
    result = await db.execute(
        select(ConversationSummary).where(
            ConversationSummary.conversation_id == conversation_id
        )
    )
    cs = result.scalar_one_or_none()
    return cs.summary_text if cs else None


# ---------------------------------------------------------------------------
# Global Memory Doc (FILE-BASED)
# ---------------------------------------------------------------------------

def get_memory_doc_content() -> str:
    """Read the global memory document from file."""
    from app.agents.file_memory import read_memory_doc
    return read_memory_doc()


def write_memory_doc_content(content_md: str) -> None:
    """Overwrite the global memory document file."""
    from app.agents.file_memory import write_memory_doc
    write_memory_doc(content_md)


# ---------------------------------------------------------------------------
# Diary Notes (FILE-BASED)
# ---------------------------------------------------------------------------

DIARY_FLUSH_PROMPT = """
你是一位专注的笔记助手。请将以下对话内容精炼成一份简洁的日记摘要，记录本次对话的关键信息。

格式要求：
- 使用 Markdown
- 包含：核心话题、重要决策/结论、用户提到的关键信息、待跟进事项（如有）
- 不超过 400 字
- 不要写"以下是摘要"之类的开场白，直接写内容

对话内容：
{conversation}
""".strip()


async def flush_conversation_to_diary(
    conversation_id: UUID, db: AsyncSession
) -> bool:
    """
    Summarise the conversation and append the summary to a dated diary file.
    Returns True if a file was written.
    """
    from app.agents.file_memory import append_diary_entry
    from app.providers.llm import chat

    result = await db.execute(
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.role.in_(["user", "assistant"]),
        )
        .order_by(Message.created_at.asc())
        .limit(40)
    )
    messages = result.scalars().all()
    if len(messages) < 4:
        return False

    conversation_text = "\n".join(
        f"{'用户' if m.role == 'user' else 'AI'}: {(m.content or '')[:500]}"
        for m in messages
    )

    try:
        summary = await chat(
            [
                {"role": "system", "content": "你是一位专注的笔记助手，只输出笔记内容，不加任何解释。"},
                {"role": "user", "content": DIARY_FLUSH_PROMPT.format(conversation=conversation_text)},
            ],
            temperature=0.3,
        )
    except Exception as exc:
        logger.warning("Diary flush failed for conversation %s: %s", conversation_id, exc)
        return False

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    import asyncio
    await asyncio.to_thread(append_diary_entry, today, summary.strip())
    logger.info("Diary file written for conversation %s (%s)", conversation_id, today)
    return True


async def get_recent_diary_notes(limit: int = 5) -> str:
    """
    Read the N most recent diary files and return them as a Markdown string.
    """
    import asyncio
    from app.agents.file_memory import read_recent_diary_notes
    return await asyncio.to_thread(read_recent_diary_notes, limit)
