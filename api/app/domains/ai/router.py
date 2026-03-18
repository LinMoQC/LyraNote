import hashlib
import json
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func as sqla_func, select

from app.dependencies import CurrentUser, DbDep
from app.config import settings
from app.models import Chunk, Notebook, Note, Source, Conversation, NotebookSummary
from app.schemas.response import ApiResponse, success
from openai import AsyncOpenAI

router = APIRouter(tags=["ai"])

# ── In-memory suggestions cache ───────────────────────────────────────────────
# user_id → (suggestions: list[str], generated_at: datetime, source_count: int)
_suggestions_cache: dict[str, tuple[list[str], datetime, int]] = {}
_CACHE_TTL = timedelta(hours=6)


class SuggestionsOut(BaseModel):
    suggestions: list[str]


@router.get("/ai/suggestions", response_model=ApiResponse[SuggestionsOut])
async def get_suggestions(current_user: CurrentUser, db: DbDep):
    """Return 4 personalised suggested questions based on the user's knowledge base and conversation history."""
    user_id = str(current_user.id)

    # Count all indexed sources across all user notebooks
    src_count_result = await db.execute(
        select(Source)
        .join(Notebook, Source.notebook_id == Notebook.id)
        .where(
            Notebook.user_id == current_user.id,
            Source.status == "indexed",
        )
    )
    source_count = len(src_count_result.scalars().all())

    # 2. Check cache — return early if still fresh
    if user_id in _suggestions_cache:
        cached_suggestions, generated_at, cached_source_count = _suggestions_cache[user_id]
        if (
            datetime.utcnow() - generated_at < _CACHE_TTL
            and cached_source_count == source_count
            and cached_suggestions
        ):
            return success(SuggestionsOut(suggestions=cached_suggestions))

    # 3. No valid cache — gather context and call LLM
    sources_context = ""
    convs_context = ""

    # Fetch up to 8 indexed sources (title + summary) across all notebooks
    src_rows_result = await db.execute(
        select(Source.title, Source.summary)
        .join(Notebook, Source.notebook_id == Notebook.id)
        .where(Notebook.user_id == current_user.id, Source.status == "indexed")
        .order_by(Source.created_at.desc())
        .limit(8)
    )
    src_rows = src_rows_result.all()
    if src_rows:
        lines = []
        for title, summary in src_rows:
            line = f"- {title}"
            if summary:
                line += f"：{summary[:80]}"
            lines.append(line)
        sources_context = "\n".join(lines)

    # Fetch last 5 conversation titles across all notebooks
    conv_result = await db.execute(
        select(Conversation.title)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.created_at.desc())
        .limit(5)
    )
    conv_titles = [r[0] for r in conv_result.all() if r[0]]
    if conv_titles:
        convs_context = "\n".join(f"- {t}" for t in conv_titles)

    # Fall back to generic suggestions if knowledge base is empty
    if not sources_context and not convs_context:
        fallback = [
            "帮我分析知识库中的核心主题",
            "为我的研究生成一份结构化摘要",
            "对比不同来源中的相似观点",
            "根据笔记内容生成学习计划",
        ]
        _suggestions_cache[user_id] = (fallback, datetime.utcnow(), source_count)
        return success(SuggestionsOut(suggestions=fallback))

    # 4. Call LLM to generate suggestions
    prompt_parts = []
    if sources_context:
        prompt_parts.append(f"知识库来源：\n{sources_context}")
    if convs_context:
        prompt_parts.append(f"最近讨论过的话题：\n{convs_context}")
    prompt_parts.append(
        "请基于以上内容，生成4个该用户可能想深入探索的问题。\n"
        "要求：\n"
        "- 只返回一个 JSON 数组，格式：[\"问题1\", \"问题2\", \"问题3\", \"问题4\"]\n"
        "- 每个问题不超过20个汉字\n"
        "- 问题要具体、有针对性，体现知识库的实际内容\n"
        "- 不要输出任何其他文字"
    )
    user_prompt = "\n\n".join(prompt_parts)

    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
    )

    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "你是一个知识发现助手，根据用户的知识库生成有价值的探索问题。只返回 JSON 数组，不含任何额外文字。",
                },
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=256,
        )
        raw = resp.choices[0].message.content or ""
        # Strip markdown code fences if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        suggestions: list[str] = json.loads(raw.strip())
        if not isinstance(suggestions, list):
            raise ValueError("not a list")
        suggestions = [str(s) for s in suggestions[:4]]
    except Exception:
        # On any LLM/parse error, use generic fallback
        suggestions = [
            "帮我分析知识库中的核心主题",
            "为我的研究生成一份结构化摘要",
            "对比不同来源中的相似观点",
            "根据笔记内容生成学习计划",
        ]

    # 5. Store in cache and return
    _suggestions_cache[user_id] = (suggestions, datetime.utcnow(), source_count)
    return success(SuggestionsOut(suggestions=suggestions))


# ── Deep Research ─────────────────────────────────────────────────────────────

class DeepResearchRequest(BaseModel):
    query: str
    notebook_id: str | None = None
    mode: Literal["quick", "deep"] = "quick"


@router.post("/ai/deep-research")
async def deep_research_stream(
    body: DeepResearchRequest,
    current_user: CurrentUser,
    db: DbDep,
):
    """
    LangGraph-powered deep research pipeline.
    plan_node → parallel search_node × N → synthesis_node → deliverable_node
    Streams SSE events via graph.astream_events(version="v2").
    """
    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
    )

    import logging as _logging
    from app.agents.memory import build_memory_context
    try:
        user_memories = await build_memory_context(current_user.id, body.query, db, top_k=5)
    except Exception as _exc:
        _logging.getLogger(__name__).warning("Memory context load failed: %s", _exc)
        user_memories = []

    async def generate():
        from app.agents.research.deep_research import create_research_graph

        graph = create_research_graph(
            db=db,
            client=client,
            tavily_api_key=settings.tavily_api_key or None,
        )

        input_state = {
            "query": body.query,
            "notebook_id": body.notebook_id,
            "user_id": str(current_user.id),
            "model": settings.llm_model,
            "tavily_api_key": settings.tavily_api_key or None,
            "user_memories": user_memories,
            # initialise accumulation fields
            "research_goal": "",
            "evaluation_criteria": [],
            "search_matrix": {},
            "learnings": [],
            "full_report": "",
            "deliverable": None,
        }

        try:
            async for event in graph.astream_events(input_state, version="v2"):
                if event["event"] == "on_custom_event":
                    sse = {"type": event["name"], "data": event["data"]}
                    yield f"data: {json.dumps(sse, ensure_ascii=False)}\n\n"
        except Exception as exc:
            error_event = {"type": "error", "data": {"message": str(exc)}}
            yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Text polish ───────────────────────────────────────────────────────────────

class PolishRequest(BaseModel):
    text: str
    instruction: str = "优化语言表达，使文字更清晰流畅、逻辑更严密，保持原有语气和核心含义"


@router.post("/ai/polish")
async def polish_text(body: PolishRequest, current_user: CurrentUser):
    """Stream-polish a piece of text inline in the editor."""
    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
    )

    async def generate():
        stream = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个专业的文字编辑。"
                        "根据用户指令对原文进行优化，只输出优化后的正文内容，"
                        "不要添加任何解释、标题、引号或额外说明。"
                        "保持与原文相同的语言（中文保持中文，英文保持英文）。"
                    ),
                },
                {
                    "role": "user",
                    "content": f"指令：{body.instruction}\n\n原文：\n{body.text}",
                },
            ],
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            token = chunk.choices[0].delta.content or ""
            if token:
                yield f"data: {json.dumps({'token': token}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Context greeting ──────────────────────────────────────────────────────────

_greeting_cache: dict[str, tuple[dict, str, datetime]] = {}
_GREETING_CACHE_TTL = timedelta(hours=1)


class GreetingSuggestion(BaseModel):
    label: str
    prompt: str | None = None
    action: str | None = None


class ContextGreetingOut(BaseModel):
    greeting: str
    suggestions: list[GreetingSuggestion]


@router.get(
    "/notebooks/{notebook_id}/context-greeting",
    response_model=ApiResponse[ContextGreetingOut],
)
async def get_context_greeting(
    notebook_id: UUID,
    current_user: CurrentUser,
    db: DbDep,
):
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
            Source.notebook_id == notebook_id,
            Source.status == "indexed",
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

    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
    )

    try:
        resp = await client.chat.completions.create(
            model=settings.llm_model or "gpt-4o-mini",
            messages=[
                {"role": "system", "content": "你是一个智能笔记助手，根据用户笔记本状态生成个性化建议。只返回JSON。"},
                {"role": "user", "content": "\n\n".join(prompt_parts)},
            ],
            temperature=0.7,
            max_tokens=300,
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

class SourceSuggestionsOut(BaseModel):
    summary: str | None
    questions: list[str]


@router.get(
    "/sources/{source_id}/suggestions",
    response_model=ApiResponse[SourceSuggestionsOut],
)
async def get_source_suggestions(
    source_id: UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    """Generate suggested questions for a newly indexed source."""
    source_result = await db.execute(select(Source).where(Source.id == source_id))
    source = source_result.scalar_one_or_none()
    if source is None or source.status != "indexed":
        return success(SourceSuggestionsOut(summary=None, questions=[]))

    if source.metadata_ and source.metadata_.get("suggestions"):
        return success(SourceSuggestionsOut(
            summary=source.summary,
            questions=source.metadata_["suggestions"],
        ))

    chunks_result = await db.execute(
        select(Chunk.content)
        .where(Chunk.source_id == source_id)
        .order_by(Chunk.chunk_index)
        .limit(3)
    )
    context = "\n".join(row[0][:500] for row in chunks_result.all())

    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
    )

    try:
        resp = await client.chat.completions.create(
            model=settings.llm_model or "gpt-4o-mini",
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
            max_tokens=200,
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
            f"这份资料的核心观点是什么？",
            f"「{source.title or '这份资料'}」中有哪些值得深入研究的点？",
        ]

    meta = source.metadata_ or {}
    meta["suggestions"] = questions
    source.metadata_ = meta
    await db.commit()

    return success(SourceSuggestionsOut(summary=source.summary, questions=questions))


# ── Writing context ───────────────────────────────────────────────────────────

class WritingContextRequest(BaseModel):
    notebook_id: str
    text_around_cursor: str


class WritingContextChunk(BaseModel):
    source_title: str
    excerpt: str
    score: float
    chunk_id: str


class WritingContextOut(BaseModel):
    chunks: list[WritingContextChunk]


@router.post("/ai/writing-context", response_model=ApiResponse[WritingContextOut])
async def get_writing_context(
    body: WritingContextRequest,
    current_user: CurrentUser,
    db: DbDep,
):
    """Return top-3 related knowledge chunks based on what the user is currently writing."""
    from app.providers.embedding import embed_query

    text = body.text_around_cursor[:500]
    if len(text.strip()) < 20:
        return success(WritingContextOut(chunks=[]))

    query_vec = await embed_query(text)

    stmt = (
        select(
            Chunk.id,
            Chunk.content,
            Chunk.source_id,
            Source.title.label("source_title"),
            (1 - Chunk.embedding.cosine_distance(query_vec)).label("score"),
        )
        .join(Source, Chunk.source_id == Source.id)
        .where(
            Source.status == "indexed",
            Chunk.notebook_id == UUID(body.notebook_id),
        )
        .order_by(Chunk.embedding.cosine_distance(query_vec))
        .limit(12)
    )

    result = await db.execute(stmt)
    rows = result.all()

    chunks = [
        WritingContextChunk(
            source_title=row.source_title or "未知来源",
            excerpt=row.content[:300],
            score=round(float(row.score), 3),
            chunk_id=str(row.id),
        )
        for row in rows
        if float(row.score) >= 0.35
    ][:3]

    return success(WritingContextOut(chunks=chunks))


# ── Cross-notebook knowledge ──────────────────────────────────────────────────

class CrossNotebookChunk(BaseModel):
    notebook_title: str
    source_title: str
    excerpt: str
    score: float
    chunk_id: str
    notebook_id: str


class CrossNotebookOut(BaseModel):
    chunks: list[CrossNotebookChunk]


@router.get(
    "/notebooks/{notebook_id}/related-knowledge",
    response_model=ApiResponse[CrossNotebookOut],
)
async def get_related_knowledge(
    notebook_id: UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    """Find related content in other notebooks based on the current notebook's summary."""
    from app.providers.embedding import embed_query

    summary_result = await db.execute(
        select(NotebookSummary.summary_md).where(NotebookSummary.notebook_id == notebook_id)
    )
    summary_md = summary_result.scalar_one_or_none()
    if not summary_md or len(summary_md.strip()) < 20:
        return success(CrossNotebookOut(chunks=[]))

    query_vec = await embed_query(summary_md[:300])

    stmt = (
        select(
            Chunk.id,
            Chunk.content,
            Chunk.source_id,
            Chunk.notebook_id,
            Source.title.label("source_title"),
            Notebook.title.label("notebook_title"),
            (1 - Chunk.embedding.cosine_distance(query_vec)).label("score"),
        )
        .outerjoin(Source, Chunk.source_id == Source.id)
        .join(Notebook, Chunk.notebook_id == Notebook.id)
        .where(
            Notebook.user_id == current_user.id,
            Chunk.notebook_id != notebook_id,
            ((Source.status == "indexed") | (Chunk.source_type == "note")),
        )
        .order_by(Chunk.embedding.cosine_distance(query_vec))
        .limit(10)
    )

    result = await db.execute(stmt)
    rows = result.all()

    chunks = [
        CrossNotebookChunk(
            notebook_title=row.notebook_title or "未命名笔记本",
            source_title=row.source_title or "📝 笔记",
            excerpt=row.content[:300],
            score=round(float(row.score), 3),
            chunk_id=str(row.id),
            notebook_id=str(row.notebook_id),
        )
        for row in rows
        if float(row.score) >= 0.35
    ][:5]

    return success(CrossNotebookOut(chunks=chunks))


# ── Proactive insights ────────────────────────────────────────────────────────

class InsightOut(BaseModel):
    id: str
    insight_type: str
    title: str
    content: str | None
    notebook_id: str | None
    is_read: bool
    created_at: str


class InsightsListOut(BaseModel):
    insights: list[InsightOut]
    unread_count: int


@router.get("/insights", response_model=ApiResponse[InsightsListOut])
async def list_insights(current_user: CurrentUser, db: DbDep):
    """Fetch recent proactive insights, keeping only the latest per task."""
    from app.models import ProactiveInsight

    result = await db.execute(
        select(ProactiveInsight)
        .where(
            ProactiveInsight.user_id == current_user.id,
            ProactiveInsight.is_read == False,  # noqa: E712
        )
        .order_by(ProactiveInsight.created_at.desc())
        .limit(50)
    )
    all_rows = result.scalars().all()

    seen_task_titles: set[str] = set()
    deduped: list[ProactiveInsight] = []
    for i in all_rows:
        if i.insight_type == "task_completed":
            if i.title in seen_task_titles:
                continue
            seen_task_titles.add(i.title)
        deduped.append(i)

    insights = deduped[:20]
    unread = len(insights)
    return success(InsightsListOut(
        insights=[
            InsightOut(
                id=str(i.id),
                insight_type=i.insight_type,
                title=i.title,
                content=i.content,
                notebook_id=str(i.notebook_id) if i.notebook_id else None,
                is_read=i.is_read,
                created_at=i.created_at.isoformat(),
            )
            for i in insights
        ],
        unread_count=unread,
    ))


@router.post("/insights/{insight_id}/read", response_model=ApiResponse[dict])
async def mark_insight_read(
    insight_id: UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    from app.models import ProactiveInsight

    result = await db.execute(
        select(ProactiveInsight).where(
            ProactiveInsight.id == insight_id,
            ProactiveInsight.user_id == current_user.id,
        )
    )
    insight = result.scalar_one_or_none()
    if insight:
        insight.is_read = True
        await db.flush()
    return success({"ok": True})


@router.post("/insights/read-all", response_model=ApiResponse[dict])
async def mark_all_insights_read(current_user: CurrentUser, db: DbDep):
    from sqlalchemy import update
    from app.models import ProactiveInsight

    await db.execute(
        update(ProactiveInsight)
        .where(
            ProactiveInsight.user_id == current_user.id,
            ProactiveInsight.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    await db.flush()
    return success({"ok": True})
