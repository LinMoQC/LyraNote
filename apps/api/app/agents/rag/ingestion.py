"""
Ingestion Agent: parse → chunk → embed → write to pgvector.
Called by the Celery worker (synchronous context, uses asyncio.run internally).

Parsing improvements (v1.0):
- PDF: pymupdf (fitz) replaces pypdf for better text extraction.
  Scanned/image pages automatically fall back to pytesseract OCR.
- Web: BeautifulSoup with heading-aware section tagging.
- Chunking: LangChain SemanticChunker uses embedding similarity to find
  natural semantic boundaries instead of fixed character counts.
- Metadata: each chunk stores page number, heading, section info in metadata_.
"""

import logging
import os
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Chunk, Source

logger = logging.getLogger(__name__)

DEFAULT_CHUNK_SIZE = 512
DEFAULT_CHUNK_OVERLAP = 64

# Minimum chars per page before OCR fallback is triggered
_OCR_THRESHOLD = 50


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
        text, chunk_metadata = await _extract_text_with_metadata(source)

        if not text or len(text.strip()) < 50:
            source.status = "failed"
            source.summary = (
                "无法提取文本内容。请确认文件格式正确，或安装 Tesseract OCR 以处理扫描件。"
            )
            await db.flush()
            return

        source.raw_text = text

        chunks_with_meta = _chunk_text_with_metadata(
            text, chunk_metadata, chunk_size=chunk_size, chunk_overlap=chunk_overlap
        )
        chunk_texts = [c["text"] for c in chunks_with_meta]
        chunk_metas = [c["metadata"] for c in chunks_with_meta]

        from app.providers.embedding import embed_texts

        batch_size = 100
        all_embeddings: list[list[float]] = []
        for i in range(0, len(chunk_texts), batch_size):
            batch = chunk_texts[i : i + batch_size]
            vecs = await embed_texts(batch)
            all_embeddings.extend(vecs)

        # Delete existing chunks before re-indexing
        existing = await db.execute(select(Chunk).where(Chunk.source_id == source.id))
        for c in existing.scalars().all():
            await db.delete(c)

        for idx, (text_chunk, vec, meta) in enumerate(
            zip(chunk_texts, all_embeddings, chunk_metas)
        ):
            chunk = Chunk(
                source_id=source.id,
                notebook_id=source.notebook_id,
                content=text_chunk,
                chunk_index=idx,
                embedding=vec,
                token_count=len(text_chunk.split()),
                metadata_=meta if meta else None,
            )
            db.add(chunk)

        source.summary = await _generate_summary(text[:3000])
        source.status = "indexed"
        await db.flush()

        from app.agents.memory import refresh_notebook_summary
        try:
            await refresh_notebook_summary(source.notebook_id, db)
        except Exception as mem_exc:
            logger.warning("Notebook summary refresh failed: %s", mem_exc)

        try:
            from app.workers.tasks import extract_knowledge_graph
            extract_knowledge_graph.delay(str(source.id))
        except Exception:
            pass

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


# ---------------------------------------------------------------------------
# Text extraction with metadata
# ---------------------------------------------------------------------------

async def _extract_text_with_metadata(source: Source) -> tuple[str, list[dict]]:
    """
    Extract raw text from a source, returning (full_text, per_page_metadata_list).

    Metadata list items contain positional information (page, heading, url, etc.)
    that is later used when chunking to attach context to each chunk.
    """
    from app.providers.storage import storage as get_storage

    if source.type == "pdf":
        if source.storage_key:
            content = await get_storage().download(source.storage_key)
            raw, meta = _parse_pdf_bytes(content)
        elif source.file_path:
            raw, meta = _parse_pdf_file(source.file_path)
        else:
            raw, meta = "", []
    elif source.type in ("md", "txt"):
        if source.storage_key:
            content = await get_storage().download(source.storage_key)
            raw = content.decode("utf-8", errors="ignore")
        elif source.file_path:
            with open(source.file_path, encoding="utf-8", errors="ignore") as f:
                raw = f.read()
        else:
            raw = ""
        meta = _extract_markdown_metadata(raw)
    elif source.type == "web" and source.url:
        raw, meta = await _fetch_url_with_metadata(source.url)
    elif source.raw_text:
        raw = source.raw_text
        meta = []
    else:
        raw, meta = "", []

    return _sanitize(raw), meta


def _parse_pdf_bytes(content: bytes) -> tuple[str, list[dict]]:
    """
    Parse PDF from bytes using pymupdf.
    Falls back to Tesseract OCR for pages with insufficient extractable text.
    Returns (full_text, page_metadata_list).
    """
    try:
        import fitz  # pymupdf
    except ImportError:
        # Fallback to pypdf if pymupdf is not installed
        return _parse_pdf_bytes_pypdf(content), []

    import io
    doc = fitz.open(stream=io.BytesIO(content), filetype="pdf")
    pages_text: list[str] = []
    page_metas: list[dict] = []

    for page_num, page in enumerate(doc, start=1):
        page_text = page.get_text("text").strip()

        if len(page_text) < _OCR_THRESHOLD:
            page_text = _ocr_page(page, page_num)

        pages_text.append(page_text)
        page_metas.append({"page": page_num, "source_type": "pdf"})

    doc.close()
    return "\n\n".join(pages_text), page_metas


def _parse_pdf_file(file_path: str) -> tuple[str, list[dict]]:
    """Parse PDF from local file path. Delegates to _parse_pdf_bytes."""
    with open(file_path, "rb") as f:
        return _parse_pdf_bytes(f.read())


def _parse_pdf_bytes_pypdf(content: bytes) -> str:
    """Legacy pypdf fallback (no OCR, no metadata)."""
    import io
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(content))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n\n".join(p for p in pages if p)


def _ocr_page(page, page_num: int) -> str:
    """
    Render a PDF page to an image and OCR it with Tesseract.
    Returns empty string if Tesseract is not installed.
    """
    try:
        import pytesseract
        from PIL import Image
        import io

        # Render at 2× resolution for better OCR accuracy
        mat = page.get_matrix(2.0, 2.0)
        pixmap = page.get_pixmap(matrix=mat, alpha=False)
        img_bytes = pixmap.tobytes("png")
        img = Image.open(io.BytesIO(img_bytes))
        text = pytesseract.image_to_string(img, lang="chi_sim+eng")
        logger.info("OCR applied to PDF page %d (%d chars extracted)", page_num, len(text))
        return text.strip()
    except ImportError:
        logger.warning("pytesseract / Pillow not installed; skipping OCR for page %d", page_num)
        return ""
    except Exception as exc:
        logger.warning("OCR failed for page %d: %s", page_num, exc)
        return ""


def _extract_markdown_metadata(text: str) -> list[dict]:
    """
    Parse ATX headings (# / ## / ###) from Markdown text.
    Returns a list of {offset, heading, level} dicts for use during chunking.
    """
    import re
    metas: list[dict] = []
    for m in re.finditer(r"^(#{1,3})\s+(.+)$", text, re.MULTILINE):
        metas.append({
            "offset": m.start(),
            "heading": m.group(2).strip(),
            "level": len(m.group(1)),
        })
    return metas


async def _fetch_url_with_metadata(url: str) -> tuple[str, list[dict]]:
    """Fetch URL content and extract section headings as metadata."""
    import httpx
    from bs4 import BeautifulSoup

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    # Extract section headings for metadata
    metas: list[dict] = []
    current_offset = 0
    for tag in soup.find_all(["h1", "h2", "h3", "p"]):
        tag_text = tag.get_text(strip=True)
        if tag.name in ("h1", "h2", "h3") and tag_text:
            metas.append({
                "offset": current_offset,
                "section": tag_text,
                "url": url,
                "level": int(tag.name[1]),
            })
        current_offset += len(tag_text) + 1

    text = soup.get_text(separator="\n", strip=True)
    return text, metas


# ---------------------------------------------------------------------------
# Chunking with metadata
# ---------------------------------------------------------------------------

def _chunk_text_with_metadata(
    text: str,
    source_metadata: list[dict],
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[dict]:
    """
    Split text into chunks and attach per-chunk metadata.

    Uses SemanticChunker when langchain_experimental is available; falls back
    to RecursiveCharacterTextSplitter (same as the original implementation).

    Returns a list of {"text": str, "metadata": dict} dicts.
    """
    chunks = _semantic_split(text, chunk_size, chunk_overlap)

    result: list[dict] = []
    char_offset = 0
    for chunk_text in chunks:
        # Find the most recent metadata entry that precedes this chunk's offset
        meta = _resolve_chunk_metadata(char_offset, source_metadata)
        result.append({"text": chunk_text, "metadata": meta})
        # Advance offset (approximate — actual offset shifts with overlap)
        char_offset += max(1, len(chunk_text) - chunk_overlap)

    return result


def _semantic_split(
    text: str,
    chunk_size: int,
    chunk_overlap: int,
) -> list[str]:
    """
    Attempt SemanticChunker first; fall back to RecursiveCharacterTextSplitter.
    """
    try:
        from langchain_experimental.text_splitter import SemanticChunker
        from langchain_openai import OpenAIEmbeddings
        from app.config import settings

        embeddings = OpenAIEmbeddings(
            model=settings.embedding_model,
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        splitter = SemanticChunker(
            embeddings=embeddings,
            breakpoint_threshold_type="percentile",
            breakpoint_threshold_amount=95,
        )
        return splitter.split_text(text)
    except (ImportError, Exception) as exc:
        if not isinstance(exc, ImportError):
            logger.debug("SemanticChunker failed (%s), falling back to recursive splitter", exc)
        return _recursive_split(text, chunk_size, chunk_overlap)


def _recursive_split(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
    )
    return splitter.split_text(text)


def _resolve_chunk_metadata(char_offset: int, source_metadata: list[dict]) -> dict:
    """
    Find the metadata entry (page, heading, section) closest to char_offset
    without exceeding it.
    """
    resolved: dict = {}
    for entry in source_metadata:
        entry_offset = entry.get("offset", 0)
        if entry_offset <= char_offset:
            resolved = entry
        else:
            break
    # Strip internal offset key — not useful for storage
    return {k: v for k, v in resolved.items() if k != "offset"}


# ---------------------------------------------------------------------------
# Summary generation
# ---------------------------------------------------------------------------

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
