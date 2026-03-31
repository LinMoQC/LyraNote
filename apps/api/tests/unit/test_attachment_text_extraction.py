from __future__ import annotations

import zipfile
from io import BytesIO

from app.agents.core.attachment_text import extract_attachment_text


def _build_docx(*paragraphs: str) -> bytes:
    document_body = "".join(
        f"<w:p><w:r><w:t>{paragraph}</w:t></w:r></w:p>" for paragraph in paragraphs
    )
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{document_body}</w:body>"
        "</w:document>"
    )

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )

    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def test_extract_attachment_text_reads_docx_paragraphs() -> None:
    payload = _build_docx(
        "LyraNote 是 AI 驱动的研究笔记应用。",
        "它支持基于私有知识库的 RAG 问答。",
    )

    text = extract_attachment_text(payload, ".docx")

    assert "LyraNote 是 AI 驱动的研究笔记应用。" in text
    assert "它支持基于私有知识库的 RAG 问答。" in text


def test_extract_attachment_text_reads_utf8_text_files() -> None:
    payload = "Lyra 是你的研究助手".encode("utf-8")

    text = extract_attachment_text(payload, ".txt")

    assert text == "Lyra 是你的研究助手"


def test_extract_attachment_text_does_not_emit_binary_garbage_for_doc() -> None:
    payload = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1binary-doc"

    text = extract_attachment_text(payload, ".doc")

    assert text == ""
