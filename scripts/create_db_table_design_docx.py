from pathlib import Path
from copy import deepcopy

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_ROW_HEIGHT_RULE, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Mm, Pt
from docx.table import Table


TABLES = [
    (
        "表3-1 用户信息表（users）",
        [
            ("id", "UUID", "36", "用户主键"),
            ("username", "varchar", "255", "用户名"),
            ("password_hash", "varchar", "255", "密码哈希"),
            ("email", "varchar", "255", "邮箱"),
            ("name", "varchar", "255", "用户姓名/昵称"),
            ("avatar_url", "text", "-", "用户头像地址"),
            ("google_id", "varchar", "255", "Google 登录标识"),
            ("github_id", "varchar", "255", "GitHub 登录标识"),
            ("oauth_unbound", "varchar", "64", "已解绑第三方登录标记"),
            ("created_at", "datetime", "-", "创建时间"),
        ],
    ),
    (
        "表3-2 笔记本信息表（notebooks）",
        [
            ("id", "UUID", "36", "笔记本主键"),
            ("user_id", "UUID", "36", "所属用户 ID"),
            ("title", "varchar", "500", "笔记本标题"),
            ("description", "text", "-", "笔记本描述"),
            ("status", "varchar", "50", "笔记本状态"),
            ("is_global", "boolean", "-", "是否全局知识库"),
            ("is_system", "boolean", "-", "是否系统笔记本"),
            ("system_type", "varchar", "50", "系统笔记本类型"),
            ("source_count", "integer", "-", "来源数量"),
            ("is_public", "boolean", "-", "是否公开"),
            ("published_at", "datetime", "-", "发布时间"),
            ("cover_emoji", "varchar", "10", "封面表情"),
            ("cover_gradient", "varchar", "50", "封面渐变样式"),
            ("created_at", "datetime", "-", "创建时间"),
            ("updated_at", "datetime", "-", "更新时间"),
        ],
    ),
    (
        "表3-3 知识来源表（sources）",
        [
            ("id", "UUID", "36", "来源主键"),
            ("notebook_id", "UUID", "36", "所属笔记本 ID"),
            ("title", "varchar", "500", "来源标题"),
            ("type", "varchar", "50", "来源类型"),
            ("status", "varchar", "50", "索引状态"),
            ("file_path", "text", "-", "文件路径"),
            ("url", "text", "-", "网页地址"),
            ("raw_text", "text", "-", "抽取后的原始文本"),
            ("summary", "text", "-", "来源摘要"),
            ("storage_key", "varchar", "500", "对象存储键"),
            ("storage_backend", "varchar", "20", "存储后端类型"),
            ("created_at", "datetime", "-", "创建时间"),
            ("updated_at", "datetime", "-", "更新时间"),
        ],
    ),
    (
        "表3-4 知识分块表（chunks）",
        [
            ("id", "UUID", "36", "分块主键"),
            ("source_id", "UUID", "36", "所属来源 ID"),
            ("notebook_id", "UUID", "36", "所属笔记本 ID"),
            ("content", "text", "-", "分块内容"),
            ("chunk_index", "integer", "-", "分块顺序号"),
            ("embedding", "vector", "-", "向量表示"),
            ("token_count", "integer", "-", "Token 数量"),
            ("metadata", "json", "-", "附加元数据"),
            ("source_type", "varchar", "20", "分块来源类型"),
            ("note_id", "UUID", "36", "关联笔记 ID"),
            ("created_at", "datetime", "-", "创建时间"),
        ],
    ),
    (
        "表3-5 对话信息表（conversations）",
        [
            ("id", "UUID", "36", "对话主键"),
            ("notebook_id", "UUID", "36", "关联笔记本 ID"),
            ("user_id", "UUID", "36", "所属用户 ID"),
            ("title", "varchar", "500", "对话标题"),
            ("source", "varchar", "20", "对话来源"),
            ("created_at", "datetime", "-", "创建时间"),
        ],
    ),
    (
        "表3-6 消息信息表（messages）",
        [
            ("id", "UUID", "36", "消息主键"),
            ("conversation_id", "UUID", "36", "所属对话 ID"),
            ("generation_id", "UUID", "36", "关联生成任务 ID"),
            ("role", "varchar", "50", "消息角色"),
            ("status", "varchar", "20", "消息状态"),
            ("content", "text", "-", "消息正文"),
            ("reasoning", "text", "-", "推理内容"),
            ("citations", "json", "-", "引用信息"),
            ("agent_steps", "json", "-", "智能代理步骤"),
            ("attachments", "json", "-", "附件信息"),
            ("speed", "json", "-", "流式速度指标"),
            ("mind_map", "json", "-", "思维导图结果"),
            ("diagram", "json", "-", "图形结果"),
            ("mcp_result", "json", "-", "MCP 工具结果"),
            ("ui_elements", "json", "-", "生成式界面元素"),
            ("parent_message_id", "UUID", "36", "父消息 ID"),
            ("created_at", "datetime", "-", "创建时间"),
        ],
    ),
    (
        "表3-7 深度研究任务表（research_tasks）",
        [
            ("id", "UUID", "36", "任务主键"),
            ("user_id", "UUID", "36", "所属用户 ID"),
            ("notebook_id", "varchar", "100", "关联笔记本 ID"),
            ("conversation_id", "UUID", "36", "关联对话 ID"),
            ("query", "text", "-", "研究问题"),
            ("mode", "varchar", "20", "研究模式"),
            ("status", "varchar", "20", "任务状态"),
            ("report", "text", "-", "研究报告"),
            ("deliverable_json", "json", "-", "结构化交付物"),
            ("timeline_json", "json", "-", "过程时间线"),
            ("web_sources_json", "json", "-", "外部资料列表"),
            ("error_message", "text", "-", "错误信息"),
            ("created_at", "datetime", "-", "创建时间"),
            ("completed_at", "datetime", "-", "完成时间"),
        ],
    ),
    (
        "表3-8 定时任务表（scheduled_tasks）",
        [
            ("id", "UUID", "36", "定时任务主键"),
            ("user_id", "UUID", "36", "所属用户 ID"),
            ("name", "varchar", "255", "任务名称"),
            ("description", "text", "-", "任务描述"),
            ("task_type", "varchar", "50", "任务类型"),
            ("schedule_cron", "varchar", "100", "调度表达式"),
            ("timezone", "varchar", "50", "时区"),
            ("parameters", "json", "-", "任务参数"),
            ("delivery_config", "json", "-", "投递配置"),
            ("enabled", "boolean", "-", "是否启用"),
            ("last_run_at", "datetime", "-", "上次执行时间"),
            ("next_run_at", "datetime", "-", "下次执行时间"),
            ("run_count", "integer", "-", "执行次数"),
            ("last_result", "text", "-", "最近执行结果"),
            ("last_error", "text", "-", "最近错误信息"),
            ("consecutive_failures", "integer", "-", "连续失败次数"),
            ("created_at", "datetime", "-", "创建时间"),
            ("updated_at", "datetime", "-", "更新时间"),
        ],
    ),
    (
        "表3-9 用户记忆表（user_memories）",
        [
            ("id", "UUID", "36", "用户记忆主键"),
            ("user_id", "UUID", "36", "所属用户 ID"),
            ("key", "varchar", "100", "记忆键"),
            ("value", "text", "-", "记忆值"),
            ("confidence", "float", "-", "置信度"),
            ("memory_type", "varchar", "20", "记忆类型"),
            ("memory_kind", "varchar", "32", "记忆类别"),
            ("access_count", "integer", "-", "访问次数"),
            ("last_accessed_at", "datetime", "-", "最后访问时间"),
            ("expires_at", "datetime", "-", "过期时间"),
            ("reinforced_by", "varchar", "36", "强化来源 ID"),
            ("embedding", "vector", "-", "记忆向量表示"),
            ("source", "varchar", "20", "记忆来源"),
            ("evidence", "text", "-", "证据链"),
            ("conflict_flag", "boolean", "-", "冲突标记"),
            ("updated_at", "datetime", "-", "更新时间"),
        ],
    ),
    (
        "表3-10 主动洞察表（proactive_insights）",
        [
            ("id", "UUID", "36", "主动洞察主键"),
            ("user_id", "UUID", "36", "所属用户 ID"),
            ("notebook_id", "UUID", "36", "所属笔记本 ID"),
            ("insight_type", "varchar", "50", "洞察类型"),
            ("title", "varchar", "500", "标题"),
            ("content", "text", "-", "洞察内容"),
            ("metadata", "json", "-", "附加元数据"),
            ("is_read", "boolean", "-", "是否已读"),
            ("created_at", "datetime", "-", "创建时间"),
        ],
    ),
]
HEADERS = ["字段名称", "类型", "长度", "字段说明"]
TEMPLATE_DOCX = Path("output/doc/LyraNote数据库表设计-template.docx")


def set_doc_fonts(doc: Document) -> None:
    style = doc.styles["Normal"]
    style.font.name = "宋体"
    style.font.size = Pt(12)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")


def set_east_asia(run, value: str) -> None:
    r_pr = run._element.get_or_add_rPr()
    r_fonts = r_pr.rFonts
    if r_fonts is None:
        r_fonts = OxmlElement("w:rFonts")
        r_pr.append(r_fonts)
    r_fonts.set(qn("w:eastAsia"), value)


def set_cell_text(cell, text: str, bold: bool = False, center: bool = True) -> None:
    cell.text = ""
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.2
    run = p.add_run(text)
    run.bold = bold
    run.font.name = "宋体"
    run.font.size = Pt(11)
    set_east_asia(run, "宋体")


def set_table_borders(table) -> None:
    tbl_pr = table._tbl.tblPr
    tbl_borders = tbl_pr.first_child_found_in("w:tblBorders")
    if tbl_borders is None:
        tbl_borders = OxmlElement("w:tblBorders")
        tbl_pr.append(tbl_borders)

    border_sizes = {
        "top": "6",
        "left": "6",
        "bottom": "6",
        "right": "6",
        "insideH": "3",
        "insideV": "3",
    }

    for border_name in ("top", "left", "bottom", "right", "insideH", "insideV"):
        border = tbl_borders.find(qn(f"w:{border_name}"))
        if border is None:
            border = OxmlElement(f"w:{border_name}")
            tbl_borders.append(border)
        border.set(qn("w:val"), "single")
        border.set(qn("w:sz"), border_sizes[border_name])
        border.set(qn("w:space"), "0")
        border.set(qn("w:color"), "000000")


def set_cell_margins(cell, top=80, start=80, bottom=80, end=80) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        elem = tc_mar.find(qn(f"w:{side}"))
        if elem is None:
            elem = OxmlElement(f"w:{side}")
            tc_mar.append(elem)
        elem.set(qn("w:w"), str(value))
        elem.set(qn("w:type"), "dxa")


def set_cell_width(cell, width_cm: float) -> None:
    cell.width = Cm(width_cm)
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.first_child_found_in("w:tcW")
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(int(Cm(width_cm).emu / 635)))
    tc_w.set(qn("w:type"), "dxa")


def set_row_cant_split(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = tr_pr.find(qn("w:cantSplit"))
    if cant_split is None:
        cant_split = OxmlElement("w:cantSplit")
        tr_pr.append(cant_split)


def format_table(table) -> None:
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.allow_autofit = False

    widths = [3.2, 2.8, 2.4, 5.8]
    for row in table.rows:
        set_row_cant_split(row)
        row.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
        row.height = Cm(0.92)
        for idx, cell in enumerate(row.cells):
            set_cell_width(cell, widths[idx])
            set_cell_margins(cell, top=90, start=90, bottom=90, end=90)

    header = table.rows[0]
    header.height = Cm(1.02)
    for cell in header.cells:
        set_cell_text(cell, cell.text, bold=True)
    set_table_borders(table)


def add_table(doc: Document, title: str, rows: list[tuple[str, str, str, str]]) -> None:
    caption = doc.add_paragraph()
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.space_before = Pt(10)
    caption.paragraph_format.space_after = Pt(4)
    cap_run = caption.add_run(title)
    cap_run.bold = True
    cap_run.font.name = "宋体"
    cap_run.font.size = Pt(12)
    cap_run._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")

    table = doc.add_table(rows=len(rows) + 1, cols=4)
    table.style = "Table Grid"
    for idx, head in enumerate(HEADERS):
        set_cell_text(table.cell(0, idx), head, bold=True)

    for i, row in enumerate(rows, start=1):
        for j, val in enumerate(row):
            set_cell_text(table.cell(i, j), val, center=True)

    format_table(table)
    doc.add_paragraph("")


def apply_run_style(run, sample_run) -> None:
    if sample_run.bold is not None:
        run.bold = sample_run.bold
    if sample_run.italic is not None:
        run.italic = sample_run.italic
    if sample_run.font.name:
        run.font.name = sample_run.font.name
    if sample_run.font.size:
        run.font.size = sample_run.font.size
    east = None
    if sample_run._element.rPr is not None and sample_run._element.rPr.rFonts is not None:
        east = sample_run._element.rPr.rFonts.get(qn("w:eastAsia"))
    if east:
        set_east_asia(run, east)


def set_cell_text_like_template(cell, text: str, sample_cell) -> None:
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    p = cell.paragraphs[0]
    sample_p = sample_cell.paragraphs[0]
    p.alignment = sample_p.alignment
    p.paragraph_format.space_before = sample_p.paragraph_format.space_before
    p.paragraph_format.space_after = sample_p.paragraph_format.space_after
    p.paragraph_format.line_spacing = sample_p.paragraph_format.line_spacing
    if not p.runs:
        p.add_run()
    sample_run = sample_p.runs[0] if sample_p.runs else None
    for idx, run in enumerate(p.runs):
        run.text = text if idx == 0 else ""
        if sample_run is not None:
            apply_run_style(run, sample_run)


def remove_row(table: Table, row_index: int) -> None:
    table._tbl.remove(table.rows[row_index]._tr)


def clone_template_table(doc: Document, template_table: Table, total_rows: int) -> Table:
    new_tbl = deepcopy(template_table._tbl)
    doc._body._element.append(new_tbl)
    table = Table(new_tbl, doc._body)
    while len(table.rows) < total_rows:
        table._tbl.append(deepcopy(template_table.rows[1]._tr))
    while len(table.rows) > total_rows:
        remove_row(table, len(table.rows) - 1)
    return table


def add_caption_like_reference(doc: Document, title: str) -> None:
    caption = doc.add_paragraph()
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.space_before = Pt(8)
    caption.paragraph_format.space_after = Pt(4)
    text = title.replace(" ", "\u3000", 1)
    run = caption.add_run(text)
    run.font.name = "宋体"
    run.font.size = Pt(12)
    run.bold = True
    set_east_asia(run, "宋体")


def build_doc_with_reference_template() -> Document:
    template_doc = Document(TEMPLATE_DOCX)
    template_table = template_doc.tables[-1]
    header_sample_cells = template_table.rows[0].cells
    body_sample_cells = template_table.rows[1].cells

    doc = Document()
    set_doc_fonts(doc)

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.0)
    section.right_margin = Cm(3.0)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    title.paragraph_format.space_after = Pt(10)
    run = title.add_run("3.3.2 数据库表设计")
    run.bold = True
    run.font.name = "黑体"
    run.font.size = Pt(14)
    set_east_asia(run, "黑体")

    for text in [
        "根据 LyraNote 系统的功能需求与当前代码实现，数据库表主要围绕用户管理、知识组织、对话交互、研究任务和持续服务等几个方面展开设计。系统底层采用 PostgreSQL 作为核心关系型数据库，并结合 pgvector 扩展保存知识分块与长期记忆的向量表示。为了体现论文中的数据库设计思路，本文选取用户表、笔记本表、知识来源表、知识分块表、对话表、消息表、深度研究任务表和定时任务表作为关键业务表进行说明。",
        "这些数据表共同构成了 LyraNote 的核心数据支撑结构。其中，用户表负责系统用户身份管理，笔记本表和知识来源表负责知识空间组织，知识分块表负责私有知识检索基础，对话表和消息表负责智能问答与 Copilot 交互过程保存，深度研究任务表和定时任务表则分别支撑复杂研究任务与持续服务流程。各主要数据表设计如下所示。",
    ]:
        p = doc.add_paragraph()
        p.paragraph_format.first_line_indent = Pt(24)
        p.paragraph_format.line_spacing = 1.5
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run(text)
        r.font.name = "宋体"
        r.font.size = Pt(12)
        set_east_asia(r, "宋体")

    for title_text, rows in TABLES:
        add_caption_like_reference(doc, title_text)
        table = clone_template_table(doc, template_table, len(rows) + 1)
        for idx, head in enumerate(HEADERS):
            set_cell_text_like_template(table.rows[0].cells[idx], head, header_sample_cells[idx])
        for row_idx, row in enumerate(rows, start=1):
            for col_idx, val in enumerate(row):
                set_cell_text_like_template(table.rows[row_idx].cells[col_idx], val, body_sample_cells[col_idx])
        doc.add_paragraph("")

    return doc


def build_doc() -> Document:
    if TEMPLATE_DOCX.exists():
        return build_doc_with_reference_template()

    doc = Document()
    set_doc_fonts(doc)

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.0)
    section.right_margin = Cm(3.0)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    title.paragraph_format.space_after = Pt(10)
    run = title.add_run("3.3.2 数据库表设计")
    run.bold = True
    run.font.name = "黑体"
    run.font.size = Pt(14)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")

    for text in [
        "根据 LyraNote 系统的功能需求与当前代码实现，数据库表主要围绕用户管理、知识组织、对话交互、研究任务和持续服务等几个方面展开设计。系统底层采用 PostgreSQL 作为核心关系型数据库，并结合 pgvector 扩展保存知识分块与长期记忆的向量表示。为了体现论文中的数据库设计思路，本文选取用户表、笔记本表、知识来源表、知识分块表、对话表、消息表、深度研究任务表和定时任务表作为关键业务表进行说明。",
        "这些数据表共同构成了 LyraNote 的核心数据支撑结构。其中，用户表负责系统用户身份管理，笔记本表和知识来源表负责知识空间组织，知识分块表负责私有知识检索基础，对话表和消息表负责智能问答与 Copilot 交互过程保存，深度研究任务表和定时任务表则分别支撑复杂研究任务与持续服务流程。各主要数据表设计如下所示。",
    ]:
        p = doc.add_paragraph()
        p.paragraph_format.first_line_indent = Pt(24)
        p.paragraph_format.line_spacing = 1.5
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run(text)
        r.font.name = "宋体"
        r.font.size = Pt(12)
        r._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")

    for title, rows in TABLES:
        add_table(doc, title, rows)

    return doc


def main() -> None:
    out = Path("output/doc/LyraNote数据库表设计.docx")
    out.parent.mkdir(parents=True, exist_ok=True)
    doc = build_doc()
    doc.save(out)
    print(out)


if __name__ == "__main__":
    main()
