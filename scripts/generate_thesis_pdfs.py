from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.pdfmetrics import registerFont
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "docs" / "graduation-thesis"
OUTPUT_DIR = ROOT / "output" / "pdf"

DOCUMENTS = [
    {
        "source": SOURCE_DIR / "lyranote-undergrad-thesis-outline.md",
        "output": OUTPUT_DIR / "lyranote-undergrad-thesis-outline.pdf",
        "title": "LyraNote 本科毕业论文大纲",
    },
    {
        "source": SOURCE_DIR / "lyranote-undergrad-thesis-demo.md",
        "output": OUTPUT_DIR / "lyranote-undergrad-thesis-demo.pdf",
        "title": "LyraNote 本科毕业论文 Demo 稿",
    },
]


def register_fonts() -> None:
    registerFont(UnicodeCIDFont("STSong-Light"))


def build_styles():
    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "BodyCN",
        parent=styles["BodyText"],
        fontName="STSong-Light",
        fontSize=11,
        leading=18,
        textColor=colors.HexColor("#1f2937"),
        spaceAfter=6,
        wordWrap="CJK",
    )
    title = ParagraphStyle(
        "TitleCN",
        parent=styles["Title"],
        fontName="STSong-Light",
        fontSize=22,
        leading=30,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#111827"),
        spaceAfter=14,
    )
    h1 = ParagraphStyle(
        "Heading1CN",
        parent=styles["Heading1"],
        fontName="STSong-Light",
        fontSize=18,
        leading=26,
        textColor=colors.HexColor("#111827"),
        spaceBefore=10,
        spaceAfter=10,
        wordWrap="CJK",
    )
    h2 = ParagraphStyle(
        "Heading2CN",
        parent=styles["Heading2"],
        fontName="STSong-Light",
        fontSize=14,
        leading=22,
        textColor=colors.HexColor("#111827"),
        spaceBefore=10,
        spaceAfter=8,
        wordWrap="CJK",
    )
    h3 = ParagraphStyle(
        "Heading3CN",
        parent=styles["Heading3"],
        fontName="STSong-Light",
        fontSize=12,
        leading=18,
        textColor=colors.HexColor("#111827"),
        spaceBefore=8,
        spaceAfter=6,
        wordWrap="CJK",
    )
    meta = ParagraphStyle(
        "MetaCN",
        parent=body,
        fontSize=10.5,
        leading=17,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#4b5563"),
        spaceAfter=4,
    )
    list_style = ParagraphStyle(
        "ListCN",
        parent=body,
        leftIndent=0,
        firstLineIndent=0,
        spaceAfter=2,
    )
    return {
        "body": body,
        "title": title,
        "h1": h1,
        "h2": h2,
        "h3": h3,
        "meta": meta,
        "list": list_style,
    }


def escape_text(text: str) -> str:
    return html.escape(text).replace("\n", "<br/>")


def add_page_number(canvas, doc) -> None:
    canvas.setFont("STSong-Light", 9)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    canvas.drawCentredString(A4[0] / 2, 10 * mm, f"{doc.page}")


def flush_paragraph(story, buffer: list[str], style) -> None:
    if not buffer:
        return
    text = " ".join(line.strip() for line in buffer).strip()
    if text:
        story.append(Paragraph(escape_text(text), style))
    buffer.clear()


def flush_list(story, items: list[str], list_type: str, styles) -> None:
    if not items:
        return
    bullet_type = "bullet" if list_type == "bullet" else "1"
    list_items = [
        ListItem(Paragraph(escape_text(item), styles["list"]))
        for item in items
    ]
    story.append(
        ListFlowable(
            list_items,
            bulletType=bullet_type,
            start="1",
            leftIndent=18,
            bulletFontName="STSong-Light",
            bulletFontSize=10.5,
            spaceAfter=6,
        )
    )
    items.clear()


def markdown_to_story(text: str, doc_title: str, styles) -> list:
    story: list = []
    story.append(Spacer(1, 22 * mm))
    story.append(Paragraph(escape_text(doc_title), styles["title"]))
    story.append(Spacer(1, 4 * mm))

    paragraph_buffer: list[str] = []
    list_buffer: list[str] = []
    list_type: str | None = None

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if stripped == "<<<PAGEBREAK>>>":
            flush_paragraph(story, paragraph_buffer, styles["body"])
            if list_type:
                flush_list(story, list_buffer, list_type, styles)
                list_type = None
            story.append(PageBreak())
            continue

        if stripped == "":
            flush_paragraph(story, paragraph_buffer, styles["body"])
            if list_type:
                flush_list(story, list_buffer, list_type, styles)
                list_type = None
            continue

        if stripped == "---":
            flush_paragraph(story, paragraph_buffer, styles["body"])
            if list_type:
                flush_list(story, list_buffer, list_type, styles)
                list_type = None
            story.append(Spacer(1, 2 * mm))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#d1d5db")))
            story.append(Spacer(1, 3 * mm))
            continue

        if stripped.startswith("# "):
            flush_paragraph(story, paragraph_buffer, styles["body"])
            if list_type:
                flush_list(story, list_buffer, list_type, styles)
                list_type = None
            story.append(Paragraph(escape_text(stripped[2:].strip()), styles["h1"]))
            continue

        if stripped.startswith("## "):
            flush_paragraph(story, paragraph_buffer, styles["body"])
            if list_type:
                flush_list(story, list_buffer, list_type, styles)
                list_type = None
            story.append(Paragraph(escape_text(stripped[3:].strip()), styles["h2"]))
            continue

        if stripped.startswith("### "):
            flush_paragraph(story, paragraph_buffer, styles["body"])
            if list_type:
                flush_list(story, list_buffer, list_type, styles)
                list_type = None
            story.append(Paragraph(escape_text(stripped[4:].strip()), styles["h3"]))
            continue

        bullet_match = re.match(r"^[-*]\s+(.*)$", stripped)
        if bullet_match:
            flush_paragraph(story, paragraph_buffer, styles["body"])
            if list_type and list_type != "bullet":
                flush_list(story, list_buffer, list_type, styles)
                list_type = None
            list_type = "bullet"
            list_buffer.append(bullet_match.group(1).strip())
            continue

        ordered_match = re.match(r"^\d+\.\s+(.*)$", stripped)
        if ordered_match:
            flush_paragraph(story, paragraph_buffer, styles["body"])
            if list_type and list_type != "ordered":
                flush_list(story, list_buffer, list_type, styles)
                list_type = None
            list_type = "ordered"
            list_buffer.append(ordered_match.group(1).strip())
            continue

        if not story or len(story) <= 4:
            flush_paragraph(story, paragraph_buffer, styles["body"])
            if list_type:
                flush_list(story, list_buffer, list_type, styles)
                list_type = None
            story.append(Paragraph(escape_text(stripped), styles["meta"]))
            continue

        paragraph_buffer.append(stripped)

    flush_paragraph(story, paragraph_buffer, styles["body"])
    if list_type:
        flush_list(story, list_buffer, list_type, styles)

    return story


def build_pdf(source_path: Path, output_path: Path, doc_title: str, styles) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    text = source_path.read_text(encoding="utf-8")
    story = markdown_to_story(text, doc_title, styles)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=doc_title,
        author="Codex for LyraNote",
    )
    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)


def main() -> None:
    register_fonts()
    styles = build_styles()
    for item in DOCUMENTS:
        build_pdf(item["source"], item["output"], item["title"], styles)
        print(f"generated: {item['output'].relative_to(ROOT)}")


if __name__ == "__main__":
    main()
