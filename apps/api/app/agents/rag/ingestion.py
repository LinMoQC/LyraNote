"""
Ingestion Agent: parse → chunk → embed → write to pgvector.
Called by the Celery worker (synchronous context, uses asyncio.run internally).
"""

import os
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Chunk, Source


DEFAULT_CHUNK_SIZE = 512
DEFAULT_CHUNK_OVERLAP = 64


async def ingest(
    source_id: str,
    db: AsyncSession,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> None:
    result = await db.execute(select(Source).where(Source.id == UUID(source_id)))
    source = result.scalar_one_or_none()
    if source is None:
        raise ValueError(f"Source {source_id} not found")

    source.status = "processing"
    await db.flush()

    try:
        text = await _extract_text(source)

        if not text or len(text.strip()) < 50:
            # PDF is likely a scanned image or the file has no extractable text.
            source.status = "failed"
            source.summary = "无法提取文本内容。该文件可能是扫描件或图片 PDF，请上传含有可选中文字的版本。"
            await db.flush()
            return

        source.raw_text = text

        chunks = _chunk_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

        from app.providers.embedding import embed_texts

        batch_size = 100
        all_embeddings: list[list[float]] = []
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            vecs = await embed_texts(batch)
            all_embeddings.extend(vecs)

        # Delete existing chunks before re-indexing
        existing = await db.execute(select(Chunk).where(Chunk.source_id == source.id))
        for c in existing.scalars().all():
            await db.delete(c)

        for idx, (text_chunk, vec) in enumerate(zip(chunks, all_embeddings)):
            chunk = Chunk(
                source_id=source.id,
                notebook_id=source.notebook_id,
                content=text_chunk,
                chunk_index=idx,
                embedding=vec,
                token_count=len(text_chunk.split()),
            )
            db.add(chunk)

        # Generate a short summary via LLM
        source.summary = await _generate_summary(text[:3000])
        source.status = "indexed"
        await db.flush()

        # Refresh the notebook-level semantic summary asynchronously
        from app.agents.memory import refresh_notebook_summary
        try:
            await refresh_notebook_summary(source.notebook_id, db)
        except Exception as mem_exc:
            import logging
            logging.getLogger(__name__).warning(
                "Notebook summary refresh failed: %s", mem_exc
            )

        # Extract knowledge graph entities and relations asynchronously
        try:
            from app.workers.tasks import extract_knowledge_graph
            extract_knowledge_graph.delay(str(source.id))
        except Exception:
            pass

        # Write a proactive insight
        try:
            from app.models import ProactiveInsight, Notebook as NbModel
            nb_result = await db.execute(
                select(NbModel.user_id).where(NbModel.id == source.notebook_id)
            )
            user_id = nb_result.scalar_one_or_none()
            if user_id:
                insight = ProactiveInsight(
                    user_id=user_id,
                    notebook_id=source.notebook_id,
                    insight_type="source_indexed",
                    title=f"「{source.title or '新资料'}」已完成索引",
                    content=source.summary[:200] if source.summary else None,
                )
                db.add(insight)
        except Exception:
            pass

    except Exception as exc:
        source.status = "failed"
        raise exc
    finally:
        await db.flush()


def _sanitize(text: str) -> str:
    """Remove null bytes and other characters rejected by PostgreSQL UTF-8."""
    return text.replace("\x00", "")


async def _extract_text(source: Source) -> str:
    """
    Extract raw text from a source.

    Priority for file-based sources (pdf / md / txt):
      1. storage_key  — download via StorageProvider (new uploads)
      2. file_path    — read directly from local disk (legacy data)
    """
    from app.providers.storage import storage as get_storage

    if source.type == "pdf":
        if source.storage_key:
            content = await get_storage().download(source.storage_key)
            raw = _parse_pdf_bytes(content)
        elif source.file_path:
            raw = _parse_pdf(source.file_path)
        else:
            raw = ""
    elif source.type in ("md", "txt"):
        if source.storage_key:
            content = await get_storage().download(source.storage_key)
            raw = content.decode("utf-8", errors="ignore")
        elif source.file_path:
            raw = _parse_text_file(source.file_path)
        else:
            raw = ""
    elif source.type == "web" and source.url:
        raw = await _fetch_url(source.url)
    elif source.raw_text:
        raw = source.raw_text
    else:
        raw = ""
    return _sanitize(raw)


def _parse_pdf_bytes(content: bytes) -> str:
    """Parse PDF from bytes (no temp file needed)."""
    import io
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def _parse_pdf(file_path: str) -> str:
    """Parse PDF from a local file path (legacy fallback)."""
    from pypdf import PdfReader

    reader = PdfReader(file_path)
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def _parse_text_file(file_path: str) -> str:
    """Read text file from local path (legacy fallback)."""
    with open(file_path, encoding="utf-8", errors="ignore") as f:
        return f.read()


async def _fetch_url(url: str) -> str:
    import httpx
    from bs4 import BeautifulSoup

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    return soup.get_text(separator="\n", strip=True)


def _chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[str]:
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
    )
    return splitter.split_text(text)


async def _generate_summary(text: str) -> str:
    from app.providers.llm import chat

    messages = [
        {
            "role": "system",
            "content": "你是一个文档摘要助手。用 2-3 句话概括以下文档的核心内容，使用中文。",
        },
        {"role": "user", "content": text},
    ]
    return await chat(messages, temperature=0.3)
