"""AI suggestions, context greetings, and source suggestions."""

import hashlib
import json
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func as sqla_func, select

from app.dependencies import CurrentUser, DbDep
from app.domains.ai.schemas import (
    ContextGreetingOut,
    GreetingSuggestion,
    SourceSuggestionsOut,
    SuggestionsOut,
)
from app.models import Chunk, Notebook, Note, Source, NotebookSummary
from app.schemas.response import ApiResponse, success
from app.providers.llm import get_utility_model, get_utility_client
from app.services.suggestion_service import SuggestionService

router = APIRouter()

@router.get("/ai/suggestions", response_model=ApiResponse[SuggestionsOut])
async def get_suggestions(current_user: CurrentUser, db: DbDep):
    """Return precomputed suggested questions from backend cache."""
    service = SuggestionService(db)
    suggestions = await service.get_user_suggestions(current_user.id)
    return success(SuggestionsOut(suggestions=suggestions))


# ── Context greeting ──────────────────────────────────────────────────────────

_greeting_cache: dict[str, tuple[dict, str, datetime]] = {}
_GREETING_CACHE_TTL = timedelta(hours=1)


@router.get(
    "/notebooks/{notebook_id}/context-greeting",
    response_model=ApiResponse[ContextGreetingOut],
)
async def get_context_greeting(notebook_id: UUID, current_user: CurrentUser, db: DbDep):
    """Generate a personalized greeting and suggested prompts based on notebook state."""
    nb_result = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
    )
    notebook = nb_result.scalar_one_or_none()
    if notebook is None:
        return success(ContextGreetingOut(
            greeting="有什么我可以帮你的吗？",
            suggestions=[
                GreetingSuggestion(label="总结关键洞察", prompt="Summarize the key insights across all sources."),
                GreetingSuggestion(label="生成演示大纲", prompt="Turn these notes into a short presentation outline."),
            ],
        ))

    src_count_result = await db.execute(
        select(sqla_func.count()).select_from(Source).where(
            Source.notebook_id == notebook_id, Source.status == "indexed",
        )
    )
    source_count = src_count_result.scalar() or 0

    note_result = await db.execute(
        select(Note).where(Note.notebook_id == notebook_id).order_by(Note.updated_at.desc()).limit(1)
    )
    note = note_result.scalar_one_or_none()
    note_excerpt = (note.content_text or "")[:500] if note else ""

    summary_result = await db.execute(
        select(NotebookSummary.summary_md).where(NotebookSummary.notebook_id == notebook_id)
    )
    summary_md = summary_result.scalar_one_or_none() or ""

    fingerprint = hashlib.md5(
        f"{source_count}:{len(note_excerpt)}:{summary_md[:100]}".encode()
    ).hexdigest()

    cache_key = str(notebook_id)
    if cache_key in _greeting_cache:
        cached, cached_fp, cached_at = _greeting_cache[cache_key]
        if cached_fp == fingerprint and datetime.utcnow() - cached_at < _GREETING_CACHE_TTL:
            return success(ContextGreetingOut(**cached))

    if source_count == 0 and not note_excerpt:
        result = {
            "greeting": "这是一个新笔记本，先添加一些研究资料吧！",
            "suggestions": [
                {"label": "上传 PDF 资料", "action": "import"},
                {"label": "从网页导入", "action": "import_url"},
            ],
        }
        _greeting_cache[cache_key] = (result, fingerprint, datetime.utcnow())
        return success(ContextGreetingOut(**result))

    if source_count > 0 and not note_excerpt:
        result = {
            "greeting": f"你已导入 {source_count} 份资料，要我帮你梳理核心要点开始写作吗？",
            "suggestions": [
                {"label": "总结所有来源的关键洞察", "prompt": "总结所有来源的关键洞察"},
                {"label": "生成研究大纲", "prompt": "基于所有来源生成一份研究大纲"},
                {"label": "对比不同来源的观点", "prompt": "对比和分析各个来源中的不同观点"},
            ],
        }
        _greeting_cache[cache_key] = (result, fingerprint, datetime.utcnow())
        return success(ContextGreetingOut(**result))

    days_since_edit = (datetime.utcnow() - (note.updated_at.replace(tzinfo=None) if note and note.updated_at else datetime.utcnow())).days if note else 0

    prompt_parts = []
    if days_since_edit > 7:
        prompt_parts.append(f"用户已经 {days_since_edit} 天没有编辑过这个笔记本了。")
    if summary_md:
        prompt_parts.append(f"笔记本摘要：{summary_md[:200]}")
    prompt_parts.append(f"笔记内容摘录：{note_excerpt[:300]}")
    prompt_parts.append(f"来源数量：{source_count}")
    prompt_parts.append(
        "请基于以上信息，生成：\n"
        "1. 一句简短的个性化问候语（不超过30字）\n"
        "2. 2-3个用户可能想问的问题\n\n"
        "返回 JSON，格式：\n"
        '{"greeting": "...", "suggestions": [{"label": "显示文本", "prompt": "发送给AI的问题"}]}\n'
        "不要输出其他内容。"
    )

    client = get_utility_client()
    try:
        resp = await client.chat.completions.create(
            model=get_utility_model(),
            messages=[
                {"role": "system", "content": "你是一个智能笔记助手，根据用户笔记本状态生成个性化建议。只返回JSON。"},
                {"role": "user", "content": "\n\n".join(prompt_parts)},
            ],
            temperature=0.7,
            max_tokens=4000,
        )
        raw = resp.choices[0].message.content or "{}"
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw.strip())
        result = {
            "greeting": data.get("greeting", "有什么我可以帮你的吗？"),
            "suggestions": data.get("suggestions", [])[:3],
        }
    except Exception:
        result = {
            "greeting": "继续你的研究吧，有什么需要帮忙的随时问我！",
            "suggestions": [
                {"label": "总结关键洞察", "prompt": "总结所有来源的关键洞察"},
                {"label": "帮我扩展当前内容", "prompt": "基于知识库内容，帮我扩展笔记中的最后一段"},
            ],
        }

    _greeting_cache[cache_key] = (result, fingerprint, datetime.utcnow())
    return success(ContextGreetingOut(**result))


# ── Source suggestions ────────────────────────────────────────────────────────

@router.get("/sources/{source_id}/suggestions", response_model=ApiResponse[SourceSuggestionsOut])
async def get_source_suggestions(source_id: UUID, current_user: CurrentUser, db: DbDep):
    """Generate suggested questions for a newly indexed source."""
    source_result = await db.execute(
        select(Source)
        .join(Notebook, Source.notebook_id == Notebook.id)
        .where(Source.id == source_id, Notebook.user_id == current_user.id)
    )
    source = source_result.scalar_one_or_none()
    if source is None or source.status != "indexed":
        return success(SourceSuggestionsOut(summary=None, questions=[]))

    if source.metadata_ and source.metadata_.get("suggestions"):
        return success(SourceSuggestionsOut(
            summary=source.summary,
            questions=source.metadata_["suggestions"],
        ))

    from app.agents.rag.retrieval import retrieve_chunks

    q = f"{source.title or ''}\n{source.summary or ''}".strip()[:800] or "资料要点"
    chunk_dicts = await retrieve_chunks(
        q,
        str(source.notebook_id),
        db,
        top_k=5,
        user_id=current_user.id,
        source_id=source.id,
        _precomputed_variants=[q],
    )
    if chunk_dicts:
        context = "\n".join((c.get("content") or "")[:500] for c in chunk_dicts)
    else:
        chunks_result = await db.execute(
            select(Chunk.content)
            .where(Chunk.source_id == source_id)
            .order_by(Chunk.chunk_index)
            .limit(3)
        )
        context = "\n".join(row[0][:500] for row in chunks_result.all())

    client = get_utility_client()
    try:
        resp = await client.chat.completions.create(
            model=get_utility_model(),
            messages=[
                {"role": "system", "content": "你是一个研究助手。根据资料内容生成探索性问题。只返回JSON数组。"},
                {
                    "role": "user",
                    "content": (
                        f"用户刚导入了一份名为「{source.title}」的资料。\n\n"
                        f"资料摘要：{source.summary or '无'}\n\n"
                        f"资料内容片段：{context[:800]}\n\n"
                        "请生成2-3个用户可能想深入探索的问题。\n"
                        '返回纯JSON数组：["问题1", "问题2", "问题3"]\n'
                        "每个问题不超过25个汉字，不要输出其他内容。"
                    ),
                },
            ],
            temperature=0.7,
            max_tokens=4000,
        )
        raw = resp.choices[0].message.content or "[]"
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        questions = json.loads(raw.strip())
        if not isinstance(questions, list):
            questions = []
        questions = [str(q) for q in questions[:3]]
    except Exception:
        questions = [
            "这份资料的核心观点是什么？",
            f"「{source.title or '这份资料'}」中有哪些值得深入研究的点？",
        ]

    meta = source.metadata_ or {}
    meta["suggestions"] = questions
    source.metadata_ = meta
    await db.commit()

    return success(SourceSuggestionsOut(summary=source.summary, questions=questions))
