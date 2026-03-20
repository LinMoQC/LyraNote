"""
File-based memory manager for LyraNote.

Stores AI memory as local Markdown files, designed for desktop-app deployment.
Files are human-readable, directly editable, and compatible with cloud sync
(iCloud / Dropbox / etc.) and git.

Directory layout (default ~/.lyranote/memory/):
    memory/
    ├── MEMORY.md          ← global evergreen memory document
    └── diary/
        ├── 2026-03-11.md  ← daily conversation summaries
        └── 2026-03-12.md
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path


_DEFAULT_MEMORY_MD = """\
# 我的 AI 记忆

> 这是 LyraNote AI 的长期记忆文档。AI 每次对话都会读取这里的内容。
> 你可以直接编辑这个文件，也可以在 LyraNote 设置 → AI 记忆 中修改。
> AI 也会在对话中自动更新这份文档。

## 关于我

<!-- 在这里写下你的基本信息，例如职业、研究方向、所在机构等 -->

## 技术背景

<!-- 你熟悉的技术栈、编程语言、工具等 -->

## 偏好与约束

<!-- 你希望 AI 遵守的偏好，例如回答语言、详细程度、格式要求等 -->

## 当前项目

<!-- 你正在进行的重要项目或研究课题 -->
"""


def get_memory_dir() -> Path:
    """
    Return the memory root directory, creating it (and diary/) if needed.
    Priority: MEMORY_DIR setting → ~/.lyranote/memory/
    """
    from app.config import settings

    raw = getattr(settings, "memory_dir", "") or ""
    if raw.strip():
        base = Path(raw.strip()).expanduser().resolve()
    else:
        base = Path.home() / ".lyranote" / "memory"

    base.mkdir(parents=True, exist_ok=True)
    (base / "diary").mkdir(exist_ok=True)
    return base


def init_memory_storage() -> None:
    """
    Called once at application startup.
    - Ensures the memory directory structure exists.
    - Creates a default MEMORY.md template if the file doesn't exist yet.
    Idempotent: safe to call multiple times.
    """
    import logging
    log = logging.getLogger(__name__)

    try:
        memory_dir = get_memory_dir()
        memory_md = memory_dir / "MEMORY.md"

        if not memory_md.exists():
            memory_md.write_text(_DEFAULT_MEMORY_MD, encoding="utf-8")
            log.info("Created default MEMORY.md at %s", memory_md)
        else:
            log.debug("Memory storage already initialized at %s", memory_dir)
    except Exception as exc:
        # Non-fatal: app can run without memory files
        logging.getLogger(__name__).warning("Failed to initialize memory storage: %s", exc)


# ---------------------------------------------------------------------------
# Global Memory Document (MEMORY.md)
# ---------------------------------------------------------------------------

def read_memory_doc() -> str:
    """Read the global memory document. Returns empty string if not yet created."""
    path = get_memory_dir() / "MEMORY.md"
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def write_memory_doc(content: str) -> None:
    """Overwrite the global memory document."""
    path = get_memory_dir() / "MEMORY.md"
    path.write_text(content, encoding="utf-8")


def get_memory_doc_mtime() -> str | None:
    """Return the last-modified time of MEMORY.md as ISO string, or None."""
    path = get_memory_dir() / "MEMORY.md"
    if not path.exists():
        return None
    mtime = path.stat().st_mtime
    return datetime.fromtimestamp(mtime).isoformat()


# ---------------------------------------------------------------------------
# Diary Notes (diary/YYYY-MM-DD.md)
# ---------------------------------------------------------------------------

def append_diary_entry(date_str: str, content: str) -> None:
    """
    Append a diary entry to the dated file. If the file already exists
    (another flush happened today), appends with a divider.
    """
    diary_dir = get_memory_dir() / "diary"
    path = diary_dir / f"{date_str}.md"

    entry = content.strip()
    if path.exists():
        existing = path.read_text(encoding="utf-8").rstrip()
        path.write_text(existing + f"\n\n---\n\n{entry}\n", encoding="utf-8")
    else:
        # Write header + content
        path.write_text(f"# {date_str} 对话摘要\n\n{entry}\n", encoding="utf-8")


def read_recent_diary_notes(limit: int = 5) -> str:
    """
    Read the N most recent diary files and return them as a single Markdown
    string for system prompt injection. Returns empty string if no files exist.
    """
    diary_dir = get_memory_dir() / "diary"
    if not diary_dir.exists():
        return ""

    md_files = sorted(diary_dir.glob("*.md"), reverse=True)[:limit]
    if not md_files:
        return ""

    parts = []
    for f in reversed(md_files):  # chronological order (oldest first)
        content = f.read_text(encoding="utf-8").strip()
        if content:
            parts.append(content)

    return "\n\n".join(parts)


def list_diary_files() -> list[dict]:
    """
    Return metadata for all diary files, newest first.
    Used by the API to list available diary notes.
    """
    diary_dir = get_memory_dir() / "diary"
    if not diary_dir.exists():
        return []

    files = sorted(diary_dir.glob("*.md"), reverse=True)
    return [
        {
            "date": f.stem,
            "path": str(f),
            "size": f.stat().st_size,
            "updated_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        }
        for f in files
    ]


# ---------------------------------------------------------------------------
# File → DB sync (desktop mode only)
# ---------------------------------------------------------------------------

def _parse_memory_doc_sections(content: str) -> list[dict]:
    """
    Parse MEMORY.md into a list of memory items.

    Strategy: each H2 section (## Title) becomes a key; the non-comment,
    non-empty text under it becomes the value. Returns items with
    memory_type="preference".

    Example:
        ## 偏好与约束
        简洁中文，要点列表格式

    →  {"key": "file_preference_bias_constraint", "value": "简洁中文，要点列表格式", ...}
    """
    import re

    items = []
    # Split on H2 headings
    sections = re.split(r"^## (.+)$", content, flags=re.MULTILINE)
    # sections = [pre_text, heading1, body1, heading2, body2, ...]
    for i in range(1, len(sections), 2):
        heading = sections[i].strip()
        body_raw = sections[i + 1] if (i + 1) < len(sections) else ""
        # Strip HTML comments and blank lines
        body_lines = [
            line for line in body_raw.splitlines()
            if line.strip() and not line.strip().startswith("<!--")
        ]
        body = " ".join(body_lines).strip()
        if not body:
            continue

        # Derive a safe key from the heading
        key = "file_" + re.sub(r"[^a-z0-9_]", "_", heading.lower())[:60].strip("_")
        items.append({
            "key": key,
            "value": body[:500],
            "memory_type": "preference",
            "confidence": 0.6,
            "ttl_days": None,
        })
    return items


async def sync_memory_doc_to_db(user_id, db, force: bool = False) -> int:
    """
    Parse MEMORY.md and upsert each section as a source='file' memory record.

    Normally only active when memory_mode='desktop'. Pass force=True to bypass
    the mode check — used when the AI explicitly writes MEMORY.md via a skill
    (update_memory_doc), so the content is always available in future conversations.
    Returns the number of items synced.
    """
    from app.config import settings
    from app.agents.memory.extraction import _upsert_memory

    if not force and settings.memory_mode != "desktop":
        return 0

    content = read_memory_doc()
    if not content.strip():
        return 0

    items = _parse_memory_doc_sections(content)
    count = 0
    for item in items:
        try:
            await _upsert_memory(
                db,
                user_id,
                item["key"],
                item["value"],
                item["confidence"],
                item["memory_type"],
                ttl_days=item["ttl_days"],
                source="file",
                evidence="MEMORY.md",
            )
            count += 1
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "sync_memory_doc_to_db: failed to upsert key '%s': %s", item["key"], exc
            )

    if count:
        await db.flush()
    return count


async def sync_diary_to_db(user_id, date_str: str, db) -> int:
    """
    Parse a daily diary file and upsert it as a single source='file' fact memory
    with a short TTL (7 days), keyed as 'diary_YYYY_MM_DD'.

    Only active when memory_mode='desktop'. Returns 1 if synced, 0 otherwise.
    """
    from app.config import settings
    from app.agents.memory.extraction import _upsert_memory

    if settings.memory_mode != "desktop":
        return 0

    diary_dir = get_memory_dir() / "diary"
    path = diary_dir / f"{date_str}.md"
    if not path.exists():
        return 0

    content = path.read_text(encoding="utf-8").strip()
    if not content:
        return 0

    key = "diary_" + date_str.replace("-", "_")
    # Truncate to 800 chars to keep the memory compact
    value = content[:800]

    try:
        await _upsert_memory(
            db,
            user_id,
            key,
            value,
            confidence=0.5,
            memory_type="fact",
            ttl_days=7,
            source="file",
            evidence=str(path),
        )
        await db.flush()
        return 1
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "sync_diary_to_db: failed for %s: %s", date_str, exc
        )
        return 0
