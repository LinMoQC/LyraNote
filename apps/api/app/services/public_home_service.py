from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import BadRequestError, NotFoundError
from app.models import Note, Notebook, PublicHomeState, UserPortrait
from app.providers.image_gen_provider import generate_image
from app.providers.llm import chat, get_utility_model
from app.providers.storage import storage

logger = logging.getLogger(__name__)

_PUBLIC_HOME_PROMPT = """你是 LyraNote 的公开主页编辑助手。
你只能基于下面这些“已公开的 notebook 内容”生成一份公开知识主页摘要。

严格约束：
1. 只能使用提供的公开 notebook 数据，不能引入任何私有信息
2. 输出内容是 AI 推断，不要把职业、兴趣等写成绝对事实
3. 不要提及系统内部字段名
4. 结果要适合公开个人知识主页，不要营销腔
5. timeline_items 必须体现研究演进，不要只是简单发布时间复述
6. featured_notebook_ids 只能填写提供的 notebook id

请严格输出 JSON，不要带 markdown 代码块，格式如下：
{{
  "hero_summary": "2-3 句公开主页简介",
  "profession_guess": "一句关于职业/身份的谨慎推断，可为空字符串",
  "interest_tags": ["兴趣标签1", "兴趣标签2"],
  "current_research": ["最近研究主题1", "最近研究主题2"],
  "timeline_items": [
    {{
      "title": "阶段标题",
      "summary": "1 句解释这个阶段在研究什么",
      "time_label": "如：最近 / 近期 / 更早之前",
      "source_notebook_ids": ["uuid"]
    }}
  ],
  "topic_clusters": ["主题簇1", "主题簇2"],
  "featured_notebook_ids": ["uuid"]
}}

公开 notebook 数据：
{source_text}
"""


def _word_count_subquery():
    return (
        select(func.coalesce(func.sum(Note.word_count), 0))
        .where(Note.notebook_id == Notebook.id)
        .correlate(Notebook)
        .scalar_subquery()
        .label("wc")
    )


def _serialize_notebook(nb: Notebook, word_count: int) -> dict[str, Any]:
    return {
        "id": nb.id,
        "title": nb.title,
        "description": nb.description,
        "summary_md": nb.summary.summary_md if nb.summary else None,
        "cover_emoji": nb.cover_emoji,
        "cover_gradient": nb.cover_gradient,
        "source_count": nb.source_count,
        "word_count": word_count,
        "published_at": nb.published_at,
    }


async def list_public_notebooks_payload(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
) -> list[dict[str, Any]]:
    stmt = (
        select(Notebook, _word_count_subquery())
        .options(selectinload(Notebook.summary))
        .where(Notebook.is_public.is_(True))
        .order_by(Notebook.published_at.desc())
    )
    if user_id is not None:
        stmt = stmt.where(Notebook.user_id == user_id)

    result = await db.execute(stmt)
    return [_serialize_notebook(nb, wc) for nb, wc in result.all()]


async def _list_public_notebooks_for_generation(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> list[dict[str, Any]]:
    stmt = (
        select(Notebook, _word_count_subquery())
        .options(selectinload(Notebook.summary), selectinload(Notebook.notes))
        .where(Notebook.is_public.is_(True), Notebook.user_id == user_id)
        .order_by(Notebook.published_at.desc())
    )
    result = await db.execute(stmt)

    payload: list[dict[str, Any]] = []
    for notebook, word_count in result.all():
        item = _serialize_notebook(notebook, word_count)
        public_notes = sorted(notebook.notes, key=lambda note: note.updated_at, reverse=True)
        item["notes"] = [
            {
                "id": note.id,
                "title": note.title,
                "content_text": note.content_text,
                "word_count": note.word_count,
                "updated_at": note.updated_at,
            }
            for note in public_notes
        ]
        payload.append(item)

    return payload


async def get_public_notebook_detail_payload(
    db: AsyncSession,
    notebook_id: uuid.UUID,
) -> dict[str, Any]:
    result = await db.execute(
        select(Notebook)
        .options(selectinload(Notebook.summary), selectinload(Notebook.notes))
        .where(Notebook.id == notebook_id, Notebook.is_public.is_(True))
    )
    nb = result.scalar_one_or_none()
    if nb is None:
        raise NotFoundError("笔记本不存在或未公开")

    wc_res = await db.execute(
        select(func.coalesce(func.sum(Note.word_count), 0)).where(Note.notebook_id == nb.id)
    )
    notes_sorted = sorted(nb.notes, key=lambda note: note.updated_at, reverse=True)
    payload = _serialize_notebook(nb, wc_res.scalar() or 0)
    payload["notes"] = [
        {
            "id": note.id,
            "title": note.title,
            "content_json": note.content_json,
            "content_text": note.content_text,
            "word_count": note.word_count,
            "created_at": note.created_at,
            "updated_at": note.updated_at,
        }
        for note in notes_sorted
    ]
    return payload


async def get_public_site_payload(db: AsyncSession) -> dict[str, Any]:
    owner_id = await _resolve_public_owner_id(db)
    if owner_id is None:
        return {
            "profile": None,
            "featured_notebooks": [],
            "recent_notebooks": [],
            "notebooks": [],
            "stats": {
                "notebook_count": 0,
                "word_count": 0,
                "source_count": 0,
                "topic_count": 0,
            },
        }

    notebooks = await list_public_notebooks_payload(db, user_id=owner_id)
    state = await _get_state(db, owner_id)
    profile = state.approved_profile_json if state else None
    featured_notebooks = _select_featured_notebooks(notebooks, profile)

    return {
        "profile": _decorate_profile(profile, generated_at=state.approved_at if state else None),
        "featured_notebooks": featured_notebooks,
        "recent_notebooks": notebooks[:6],
        "notebooks": notebooks,
        "stats": _build_stats(notebooks, profile),
    }


async def get_public_home_admin_state(db: AsyncSession, user_id: uuid.UUID) -> dict[str, Any]:
    notebooks = await list_public_notebooks_payload(db, user_id=user_id)
    state = await _get_or_create_state(db, user_id)

    return {
        "draft_profile": _decorate_profile(state.draft_profile_json, generated_at=state.draft_generated_at),
        "approved_profile": _decorate_profile(state.approved_profile_json, generated_at=state.approved_at),
        "draft_generated_at": state.draft_generated_at,
        "approved_at": state.approved_at,
        "notebooks": notebooks,
        "featured_notebooks": _select_featured_notebooks(
            notebooks,
            state.draft_profile_json or state.approved_profile_json,
        ),
        "stats": _build_stats(notebooks, state.draft_profile_json or state.approved_profile_json),
    }


async def generate_public_home_draft(db: AsyncSession, user_id: uuid.UUID) -> dict[str, Any]:
    notebooks = await _list_public_notebooks_for_generation(db, user_id=user_id)
    state = await _get_or_create_state(db, user_id)
    now = datetime.now(timezone.utc)

    if not notebooks:
        state.draft_profile_json = None
        state.draft_generated_at = now
        return await get_public_home_admin_state(db, user_id)

    profile = await _generate_profile_from_public_notebooks(notebooks)
    portrait_snapshot = await _load_public_portrait_snapshot(db, user_id)
    if portrait_snapshot:
        profile["portrait_snapshot"] = portrait_snapshot

    avatar_url = await _generate_and_store_avatar(user_id, portrait_snapshot, profile, db=db)
    if avatar_url:
        profile["avatar_url"] = avatar_url

    state.draft_profile_json = profile
    state.draft_generated_at = now
    return await get_public_home_admin_state(db, user_id)


async def approve_public_home_draft(db: AsyncSession, user_id: uuid.UUID) -> dict[str, Any]:
    state = await _get_or_create_state(db, user_id)
    if not state.draft_profile_json:
        raise BadRequestError("暂无可发布的公开主页草稿")

    state.approved_profile_json = state.draft_profile_json
    state.approved_at = datetime.now(timezone.utc)
    return await get_public_home_admin_state(db, user_id)


async def discard_public_home_draft(db: AsyncSession, user_id: uuid.UUID) -> dict[str, Any]:
    state = await _get_or_create_state(db, user_id)
    state.draft_profile_json = None
    state.draft_generated_at = None
    return await get_public_home_admin_state(db, user_id)


async def backfill_public_home_portrait_snapshot(db: AsyncSession, user_id: uuid.UUID) -> dict[str, Any]:
    state = await _get_or_create_state(db, user_id)
    portrait_snapshot = await _load_public_portrait_snapshot(db, user_id)

    if portrait_snapshot is None:
        raise BadRequestError("暂无可用于公开主页的个人画像")

    updated = False
    if state.approved_profile_json:
        state.approved_profile_json = _attach_portrait_snapshot(state.approved_profile_json, portrait_snapshot)
        updated = True
    if state.draft_profile_json:
        state.draft_profile_json = _attach_portrait_snapshot(state.draft_profile_json, portrait_snapshot)
        updated = True

    if not updated:
        raise BadRequestError("暂无可回填的公开主页版本")

    return await get_public_home_admin_state(db, user_id)


async def refresh_public_home_draft(db: AsyncSession, user_id: uuid.UUID) -> None:
    await generate_public_home_draft(db, user_id)


async def _get_state(db: AsyncSession, user_id: uuid.UUID) -> PublicHomeState | None:
    return (
        await db.execute(select(PublicHomeState).where(PublicHomeState.user_id == user_id))
    ).scalar_one_or_none()


async def _get_or_create_state(db: AsyncSession, user_id: uuid.UUID) -> PublicHomeState:
    state = await _get_state(db, user_id)
    if state is not None:
        return state

    state = PublicHomeState(user_id=user_id)
    db.add(state)
    await db.flush()
    return state


async def _resolve_public_owner_id(db: AsyncSession) -> uuid.UUID | None:
    approved_owner = (
        await db.execute(
            select(PublicHomeState.user_id)
            .where(PublicHomeState.approved_profile_json.is_not(None))
            .order_by(PublicHomeState.approved_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if approved_owner is not None:
        return approved_owner

    latest_public_owner = (
        await db.execute(
            select(Notebook.user_id)
            .where(Notebook.is_public.is_(True))
            .order_by(Notebook.published_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return latest_public_owner


async def _generate_and_store_avatar(
    user_id: uuid.UUID,
    portrait_snapshot: dict[str, Any] | None,
    profile: dict[str, Any],
    db: AsyncSession | None = None,
) -> str | None:
    """Generate an anime-style AI avatar via SiliconFlow and persist it to storage.

    Returns the storage URL on success, None when the feature is disabled
    (``image_gen_api_key`` not configured) or if any error occurs.
    The caller should treat None as a graceful skip — the frontend falls back
    to a deterministic DiceBear SVG in that case.

    When ``db`` is provided the URL is also written to ``UserPortrait.avatar_url``
    so the self-portrait page can display it independently of the public home page.
    """
    from app.config import settings

    if not settings.image_gen_api_key:
        return None

    try:
        prompt = _build_avatar_prompt(portrait_snapshot, profile)
        logger.info("Generating AI avatar for user %s", user_id)
        image_bytes = await generate_image(
            prompt,
            api_key=settings.image_gen_api_key,
            base_url=settings.image_gen_base_url,
            model=settings.image_gen_model,
        )
        key = f"avatars/{user_id}/portrait.webp"
        await storage().upload(key, image_bytes, "image/webp")
        url = await storage().get_url(key, expires_in=365 * 24 * 3600)
        logger.info("AI avatar stored at %s for user %s", url, user_id)

        # Persist to UserPortrait so the self-portrait page can display it
        if db is not None:
            try:
                from sqlalchemy import select
                portrait_row = (
                    await db.execute(
                        select(UserPortrait).where(UserPortrait.user_id == user_id)
                    )
                ).scalar_one_or_none()
                if portrait_row is not None:
                    portrait_row.avatar_url = url
                    # Don't commit here — caller holds the transaction
            except Exception:
                logger.debug("Failed to update UserPortrait.avatar_url for user %s", user_id, exc_info=True)

        return url
    except Exception:
        logger.warning("Failed to generate AI avatar for user %s — skipping", user_id, exc_info=True)
        return None


# Domain keyword → visual element shown in the avatar background / around character
_DOMAIN_VISUALS: dict[str, str] = {
    "machine learning": "surrounded by glowing neural network diagrams",
    "deep learning": "surrounded by soft glowing circuit patterns",
    "ai": "surrounded by holographic AI symbols",
    "frontend": "colorful UI interface elements floating nearby",
    "web": "browser window and code snippets floating nearby",
    "backend": "server architecture diagrams in background",
    "security": "digital shield and lock symbols around",
    "writing": "open book and fountain pen beside",
    "design": "color palette swatches and sketch tools nearby",
    "data": "flowing data visualization streams",
    "research": "open books and magnifying glass nearby",
    "mathematics": "elegant floating equations in background",
    "biology": "soft molecular structures around",
    "finance": "subtle chart lines in background",
    "game": "pixel art game controller beside",
    "music": "musical notes floating around",
    "photo": "camera lens and soft bokeh",
}

# Personality keyword → facial expression / accessory for the character
_PERSONALITY_EXPRESSIONS: dict[str, str] = {
    "systematic": "calm and focused expression, slight confident smile",
    "creative": "bright eyes full of curiosity, warm gentle smile",
    "analytical": "thoughtful expression, wearing slim elegant glasses",
    "explorer": "eager curious eyes, adventurous open smile",
    "communicator": "warm friendly smile, welcoming approachable expression",
    "introverted": "serene gentle expression, quiet inner confidence",
    "pragmatic": "steady calm expression, capable determined look",
    "visionary": "dreamy inspired eyes, soft contemplative smile",
}


def _build_avatar_prompt(
    portrait_snapshot: dict[str, Any] | None,
    profile: dict[str, Any],
) -> str:
    """Translate portrait data into a stable, high-quality anime avatar prompt."""
    role = ""
    personality = ""
    domains: list[str] = []

    if portrait_snapshot:
        identity = portrait_snapshot.get("identity") or {}
        role = str(identity.get("primary_role") or "").strip()
        personality = str(identity.get("personality_type") or "").strip()
        km = portrait_snapshot.get("knowledge_map") or {}
        domains = [str(d) for d in (km.get("expert_domains") or [])[:3] if d]

    if not role:
        role = str(profile.get("profession_guess") or "").strip()
    if not role:
        tags = profile.get("interest_tags") or []
        role = str(tags[0]).strip() if tags else "researcher"

    # Find matching visual accessory for top domain
    visual_accessory = ""
    for domain in domains:
        dl = domain.lower()
        for keyword, visual in _DOMAIN_VISUALS.items():
            if keyword in dl:
                visual_accessory = visual
                break
        if visual_accessory:
            break

    # Find matching expression for personality type
    expression = "gentle thoughtful expression, warm subtle smile"
    for keyword, expr in _PERSONALITY_EXPRESSIONS.items():
        if personality and keyword in personality.lower():
            expression = expr
            break

    accessory_clause = f", {visual_accessory}" if visual_accessory else ""

    return (
        f"anime style portrait illustration, {role}, {expression}{accessory_clause}, "
        "soft pastel color palette, clean off-white background with dreamy bokeh, "
        "studio ghibli inspired character design, warm soft lighting from above, "
        "high quality detailed digital illustration, centered square composition"
    )


async def _generate_profile_from_public_notebooks(
    notebooks: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = _PUBLIC_HOME_PROMPT.format(source_text=_format_public_source_text(notebooks))
    fallback = _build_fallback_profile(notebooks)

    try:
        raw = await chat(
            messages=[{"role": "user", "content": prompt}],
            model=get_utility_model(),
            temperature=0.2,
            max_tokens=1400,
        )
        parsed = _parse_json_object(raw)
        if not isinstance(parsed, dict):
            return fallback
        return _normalize_profile(parsed, notebooks, fallback=fallback)
    except Exception:
        logger.warning("Failed to generate public home draft via LLM", exc_info=True)
        return fallback


def _format_public_source_text(notebooks: list[dict[str, Any]]) -> str:
    chunks: list[str] = []
    for notebook in notebooks[:8]:
        note_excerpt = ""
        notes = notebook.get("notes") or []
        if notes:
            excerpt_parts = []
            for note in notes[:2]:
                content_text = (note.get("content_text") or "").strip()
                if content_text:
                    excerpt_parts.append(content_text[:280])
            note_excerpt = "\n".join(excerpt_parts)

        parts = [
            f"- id: {notebook['id']}",
            f"  title: {notebook['title']}",
            f"  published_at: {notebook.get('published_at')}",
            f"  description: {(notebook.get('description') or '')[:240]}",
            f"  summary: {(notebook.get('summary_md') or '')[:320]}",
            f"  word_count: {notebook.get('word_count', 0)}",
        ]
        if note_excerpt:
            parts.append(f"  excerpt: {note_excerpt}")
        chunks.append("\n".join(parts))
    return "\n\n".join(chunks)


def _build_fallback_profile(notebooks: list[dict[str, Any]]) -> dict[str, Any]:
    top_titles = [str(nb["title"]).strip() for nb in notebooks[:3] if str(nb["title"]).strip()]
    summary_fragments = [
        (str(nb.get("summary_md") or nb.get("description") or "").strip())
        for nb in notebooks[:3]
    ]
    topic_clusters = _pick_topic_clusters(notebooks)
    current_research = topic_clusters[:3] or top_titles[:3]

    timeline_items = []
    for index, notebook in enumerate(notebooks[:3]):
        timeline_items.append(
            {
                "title": notebook["title"],
                "summary": (
                    str(notebook.get("summary_md") or notebook.get("description") or "围绕公开知识成果持续推进研究")
                    .strip()[:120]
                ),
                "time_label": "最近" if index == 0 else "近期" if index == 1 else "更早之前",
                "source_notebook_ids": [str(notebook["id"])],
            }
        )

    hero = "这是一位持续公开整理研究笔记与知识成果的创作者。"
    if top_titles:
        hero = f"这是一位持续公开整理研究笔记与知识成果的创作者，近期重点围绕 {', '.join(top_titles[:2])} 展开。"
    if summary_fragments and summary_fragments[0]:
        hero = f"{hero} {summary_fragments[0][:90]}"

    return {
        "hero_summary": hero,
        "profession_guess": topic_clusters[0] if topic_clusters else "",
        "interest_tags": topic_clusters[:6],
        "current_research": current_research,
        "timeline_items": timeline_items,
        "topic_clusters": topic_clusters,
        "featured_notebook_ids": [str(nb["id"]) for nb in notebooks[:3]],
    }


async def _load_public_portrait_snapshot(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> dict[str, Any] | None:
    raw_portrait = (
        await db.execute(select(UserPortrait.portrait_json).where(UserPortrait.user_id == user_id))
    ).scalar_one_or_none()
    if not isinstance(raw_portrait, dict):
        return None

    def _text(value: Any) -> str:
        return str(value).strip() if value else ""

    def _list(value: Any, *, limit: int = 8) -> list[str]:
        if not isinstance(value, list):
            return []
        items: list[str] = []
        for item in value:
            text = _text(item)
            if text and text not in items:
                items.append(text)
            if len(items) >= limit:
                break
        return items

    def _float(value: Any) -> float | None:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    identity = raw_portrait.get("identity") or {}
    knowledge_map = raw_portrait.get("knowledge_map") or {}
    research_trajectory = raw_portrait.get("research_trajectory") or {}
    interaction_style = raw_portrait.get("interaction_style") or {}
    growth_signals = raw_portrait.get("growth_signals") or {}
    work_patterns = raw_portrait.get("work_patterns") or {}

    snapshot = {
        "identity_summary": _text(raw_portrait.get("identity_summary")),
        "identity": {
            "primary_role": _text(identity.get("primary_role")),
            "expertise_level": _text(identity.get("expertise_level")),
            "personality_type": _text(identity.get("personality_type")),
            "confidence": _float(identity.get("confidence")),
        },
        "knowledge_map": {
            "expert_domains": _list(knowledge_map.get("expert_domains")),
            "learning_domains": _list(knowledge_map.get("learning_domains")),
            "weak_domains": _list(knowledge_map.get("weak_domains")),
            "emerging_interest": _list(knowledge_map.get("emerging_interest")),
        },
        "research_trajectory": {
            "current_focus": _text(research_trajectory.get("current_focus")),
            "recently_completed": _list(research_trajectory.get("recently_completed"), limit=6),
            "next_likely_topics": _list(research_trajectory.get("next_likely_topics"), limit=6),
            "long_term_direction": _text(research_trajectory.get("long_term_direction")),
        },
        "interaction_style": {
            "preferred_depth": _text(interaction_style.get("preferred_depth")),
            "answer_format": _text(interaction_style.get("answer_format")),
            "preferred_language": _text(interaction_style.get("preferred_language")),
            "engagement_style": _text(interaction_style.get("engagement_style")),
        },
        "growth_signals": {
            "knowledge_velocity": _text(growth_signals.get("knowledge_velocity")),
            "this_period_learned": _list(growth_signals.get("this_period_learned"), limit=6),
            "recurring_questions": _list(growth_signals.get("recurring_questions"), limit=6),
            "knowledge_gaps_detected": _list(growth_signals.get("knowledge_gaps_detected"), limit=6),
        },
        "work_patterns": {
            "prefers_deep_focus": bool(work_patterns.get("prefers_deep_focus")) if work_patterns.get("prefers_deep_focus") is not None else None,
            "writing_to_reading_ratio": _float(work_patterns.get("writing_to_reading_ratio")),
            "session_style": _text(work_patterns.get("session_style")),
        },
    }

    if not snapshot["identity_summary"] and not snapshot["identity"]["primary_role"]:
        return None

    return snapshot


def _pick_topic_clusters(notebooks: list[dict[str, Any]]) -> list[str]:
    seeds: list[str] = []
    for notebook in notebooks:
        for text in (notebook.get("title"), notebook.get("summary_md"), notebook.get("description")):
            if not text:
                continue
            parts = [
                part.strip(" -:：,，。.()[]")
                for part in str(text).replace("\n", " ").split()
            ]
            for part in parts:
                if len(part) >= 2 and part not in seeds:
                    seeds.append(part)
                if len(seeds) >= 8:
                    return seeds
    return seeds[:8]


def _normalize_profile(
    raw: dict[str, Any],
    notebooks: list[dict[str, Any]],
    *,
    fallback: dict[str, Any],
) -> dict[str, Any]:
    notebook_ids = {str(nb["id"]) for nb in notebooks}

    def _clean_text(value: Any, default: str = "") -> str:
        return str(value).strip() if value else default

    def _clean_list(value: Any, *, limit: int) -> list[str]:
        if not isinstance(value, list):
            return []
        seen: list[str] = []
        for item in value:
            text = _clean_text(item)
            if text and text not in seen:
                seen.append(text)
            if len(seen) >= limit:
                break
        return seen

    timeline_items: list[dict[str, Any]] = []
    for item in raw.get("timeline_items", []):
        if not isinstance(item, dict):
            continue
        source_ids = [
            source_id
            for source_id in _clean_list(item.get("source_notebook_ids"), limit=4)
            if source_id in notebook_ids
        ]
        if not source_ids:
            source_ids = [str(notebooks[min(len(timeline_items), len(notebooks) - 1)]["id"])]

        title = _clean_text(item.get("title"))
        summary = _clean_text(item.get("summary"))
        if not title or not summary:
            continue

        timeline_items.append(
            {
                "title": title,
                "summary": summary,
                "time_label": _clean_text(item.get("time_label"), "近期"),
                "source_notebook_ids": source_ids,
            }
        )

    featured_ids = [
        notebook_id for notebook_id in _clean_list(raw.get("featured_notebook_ids"), limit=4)
        if notebook_id in notebook_ids
    ]

    profile = {
        "hero_summary": _clean_text(raw.get("hero_summary"), fallback["hero_summary"]),
        "profession_guess": _clean_text(raw.get("profession_guess"), fallback["profession_guess"]),
        "interest_tags": _clean_list(raw.get("interest_tags"), limit=8) or fallback["interest_tags"],
        "current_research": _clean_list(raw.get("current_research"), limit=6) or fallback["current_research"],
        "timeline_items": timeline_items or fallback["timeline_items"],
        "topic_clusters": _clean_list(raw.get("topic_clusters"), limit=8) or fallback["topic_clusters"],
        "featured_notebook_ids": featured_ids or fallback["featured_notebook_ids"],
        "portrait_snapshot": raw.get("portrait_snapshot"),
    }
    return profile


def _attach_portrait_snapshot(profile: dict[str, Any], portrait_snapshot: dict[str, Any]) -> dict[str, Any]:
    payload = dict(profile)
    payload["portrait_snapshot"] = portrait_snapshot
    return payload


def _select_featured_notebooks(
    notebooks: list[dict[str, Any]],
    profile: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if not notebooks:
        return []

    notebook_map = {str(notebook["id"]): notebook for notebook in notebooks}
    featured: list[dict[str, Any]] = []
    for notebook_id in (profile or {}).get("featured_notebook_ids", []):
        notebook = notebook_map.get(str(notebook_id))
        if notebook and notebook not in featured:
            featured.append(notebook)
    return featured or notebooks[:3]


def _build_stats(
    notebooks: list[dict[str, Any]],
    profile: dict[str, Any] | None,
) -> dict[str, int]:
    return {
        "notebook_count": len(notebooks),
        "word_count": sum(int(notebook.get("word_count") or 0) for notebook in notebooks),
        "source_count": sum(int(notebook.get("source_count") or 0) for notebook in notebooks),
        "topic_count": len((profile or {}).get("topic_clusters", [])) or len(_pick_topic_clusters(notebooks)),
    }


def _decorate_profile(
    profile: dict[str, Any] | None,
    *,
    generated_at: datetime | None,
) -> dict[str, Any] | None:
    if not profile:
        return None

    payload = dict(profile)
    payload["generated_at"] = generated_at
    payload["is_ai_generated"] = True
    return payload


def _parse_json_object(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        inner = lines[1:-1] if lines and lines[-1].strip() == "```" else lines[1:]
        text = "\n".join(inner)
    try:
        result = json.loads(text)
        return result if isinstance(result, dict) else None
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                result = json.loads(text[start:end])
                return result if isinstance(result, dict) else None
            except json.JSONDecodeError:
                return None
    return None
