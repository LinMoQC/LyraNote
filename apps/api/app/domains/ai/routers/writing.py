"""Text polish and writing context endpoints."""

import json
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.domains.ai.schemas import (
    PolishRequest,
    WritingContextChunk,
    WritingContextOut,
    WritingContextRequest,
)
from app.models import Notebook
from app.schemas.response import ApiResponse, success
from app.providers.llm import get_utility_model, get_utility_client

router = APIRouter()


# ── Text polish ───────────────────────────────────────────────────────────────

@router.post("/ai/polish")
async def polish_text(body: PolishRequest, current_user: CurrentUser):
    """Stream-polish a piece of text inline in the editor."""
    client = get_utility_client()

    async def generate():
        stream = await client.chat.completions.create(
            model=get_utility_model(),
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
    from app.agents.rag.retrieval import retrieve_chunks

    text = body.text_around_cursor[:500]
    if len(text.strip()) < 20:
        return success(WritingContextOut(chunks=[]))

    nb_row = await db.execute(
        select(Notebook.id).where(
            Notebook.id == UUID(body.notebook_id),
            Notebook.user_id == current_user.id,
        )
    )
    if nb_row.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    q = text.strip()
    rows = await retrieve_chunks(
        q,
        body.notebook_id,
        db,
        top_k=3,
        user_id=current_user.id,
        _precomputed_variants=[q],
    )

    chunks = [
        WritingContextChunk(
            source_title=r.get("source_title") or "未知来源",
            excerpt=(r.get("excerpt") or r.get("content") or "")[:300],
            score=round(float(r.get("score") or 0), 3),
            chunk_id=str(r.get("chunk_id", "")),
        )
        for r in rows
    ]

    return success(WritingContextOut(chunks=chunks))
