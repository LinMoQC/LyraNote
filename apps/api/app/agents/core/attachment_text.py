from __future__ import annotations

import io
import logging
import zipfile
from xml.etree import ElementTree

logger = logging.getLogger(__name__)

_WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def _sanitize(text: str) -> str:
    return text.replace("\x00", "").strip()


def _decode_text_bytes(data: bytes) -> str:
    return _sanitize(data.decode("utf-8", errors="replace"))


def _extract_docx_text(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            document_xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile):
        return ""

    try:
        root = ElementTree.fromstring(document_xml)
    except ElementTree.ParseError:
        return ""

    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", _WORD_NS):
        runs = [
            node.text for node in paragraph.findall(".//w:t", _WORD_NS) if node.text
        ]
        if runs:
            paragraphs.append("".join(runs))

    return _sanitize("\n".join(paragraphs))


def _extract_pdf_text(data: bytes) -> str:
    try:
        import fitz  # pymupdf

        doc = fitz.open(stream=io.BytesIO(data), filetype="pdf")
        try:
            pages = [(page.get_text("text") or "").strip() for page in doc[:20]]
        finally:
            doc.close()
        text = "\n\n".join(page for page in pages if page)
        if text.strip():
            return _sanitize(text)
    except Exception:
        logger.warning("PyMuPDF attachment extraction failed", exc_info=True)

    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        pages = [(page.extract_text() or "").strip() for page in reader.pages[:20]]
        return _sanitize("\n\n".join(page for page in pages if page))
    except Exception:
        logger.warning("pypdf attachment extraction failed", exc_info=True)
        return ""


def extract_attachment_text(data: bytes, ext: str) -> str:
    normalized_ext = ext.lower()

    if normalized_ext == ".pdf":
        return _extract_pdf_text(data)
    if normalized_ext == ".docx":
        return _extract_docx_text(data)
    if normalized_ext in {".txt", ".md", ""}:
        return _decode_text_bytes(data)
    if normalized_ext == ".doc":
        return ""

    return ""
