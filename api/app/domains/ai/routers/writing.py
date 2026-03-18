"""Text polish and writing context endpoints."""

import json
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.domains.ai.schemas import (
    PolishRequest,
    WritingContextChunk,
    WritingContextOut,
    WritingContextRequest,
)
from app.models import Chunk, Source
from app.schemas.response import ApiResponse, success
from app.providers.llm import get_client

router = APIRouter()


# ── Text polish ───────────────────────────────────────────────────────────────

@router.post("/ai/polish")
async def polish_text(body: PolishRequest, current_user: CurrentUser):
    """Stream-polish a piece of text inline in the editor."""
    client = get_client()

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


# ── Writing context ───────────────────────────────────────────────────────────

@router.post("/ai/writing-context", response_model=ApiResponse[WritingContextOut])
async def get_writing_context(body: WritingContextRequest, current_user: CurrentUser, db: DbDep):
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
