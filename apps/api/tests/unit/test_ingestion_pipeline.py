import zipfile
from io import BytesIO

from app.agents.rag import ingestion


def test_auto_split_prefers_recursive_splitter(monkeypatch) -> None:
    def _boom(*_args, **_kwargs):
        raise AssertionError("auto splitter should not call semantic splitter")

    monkeypatch.setattr(ingestion, "_semantic_split", _boom)
    monkeypatch.setattr(ingestion, "_recursive_split", lambda *_args, **_kwargs: ["chunk-a"])

    chunks = ingestion._split_text("example text", 128, 16, splitter_type="auto")

    assert chunks == ["chunk-a"]


def test_build_fallback_summary_condenses_and_truncates() -> None:
    text = "第一段内容。\n\n第二段内容。  " * 30

    summary = ingestion._build_fallback_summary(text, limit=40)

    assert "\n" not in summary
    assert len(summary) <= 40
    assert summary.endswith("...")


def test_parse_docx_bytes_extracts_paragraph_text() -> None:
    xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>第一段内容</w:t></w:r></w:p>
        <w:p><w:r><w:t>第二段内容</w:t></w:r></w:p>
      </w:body>
    </w:document>
    """
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("word/document.xml", xml)

    text, meta = ingestion._parse_docx_bytes(buf.getvalue())

    assert text == "第一段内容\n\n第二段内容"
    assert meta == []
