"""
Built-in Skill: create_note_draft
Creates a new note draft directly in the current notebook.
"""

from __future__ import annotations

from app.skills.base import SkillBase, SkillMeta


class CreateNoteSkill(SkillBase):
    meta = SkillMeta(
        name="create-note-draft",
        display_name="创建笔记",
        description=(
            "直接在笔记本中创建一篇笔记草稿。"
            "当用户要求整理笔记、保存结论或创建新文档时调用。"
    ),
        category="writing",
        interrupt_behavior="block",
        thought_label="✏️ 正在创建笔记",
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "create_note_draft",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "笔记标题"},
                    "content": {"type": "string", "description": "笔记正文，Markdown 格式"},
                    "notebook_title": {
                        "type": "string",
                        "description": "新笔记本名称（仅在全局对话中未绑定笔记本时需要提供）",
                    },
                },
                "required": ["title", "content"],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        from app.models import Note, Notebook

        title = args.get("title", "AI 草稿")
        content = args.get("content", "")
        notebook_title = args.get("notebook_title") or title
        new_nodes = _markdown_to_tiptap(content)["content"]

        notebook_id = ctx.notebook_id if hasattr(ctx, 'notebook_id') and ctx.notebook_id else None

        from uuid import UUID
        if not notebook_id:
            # Global chat: create a new notebook to hold this note
            new_notebook = Notebook(
                user_id=ctx.user_id,
                title=notebook_title,
            )
            ctx.db.add(new_notebook)
            await ctx.db.flush()
            notebook_id_uuid = new_notebook.id
            ctx.created_notebook_id = str(new_notebook.id)
        else:
            notebook_id_uuid = UUID(str(notebook_id))

        note = Note(
            notebook_id=notebook_id_uuid,
            user_id=ctx.user_id,
            title=title,
            content_json={"type": "doc", "content": new_nodes},
            content_text=content,
        )
        ctx.db.add(note)
        await ctx.db.flush()

        ctx.created_note_id = str(note.id)
        ctx.created_note_title = title

        return f"NOTE_CREATED:{note.id}:已将内容写入笔记《{title}》（ID: {note.id}）"


def _markdown_to_tiptap(md: str) -> dict:
    """Convert a Markdown string into a minimal Tiptap-compatible JSON document."""
    lines = md.split("\n")
    nodes: list[dict] = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Headings
        for level in range(5, 0, -1):
            prefix = "#" * level + " "
            if line.startswith(prefix):
                text = line[len(prefix):]
                nodes.append({
                    "type": "heading",
                    "attrs": {"level": level},
                    "content": _inline(text),
                })
                break
        else:
            # Bullet list item
            if line.startswith("- ") or line.startswith("* "):
                items = []
                while i < len(lines) and (lines[i].startswith("- ") or lines[i].startswith("* ")):
                    items.append({
                        "type": "listItem",
                        "content": [{"type": "paragraph", "content": _inline(lines[i][2:])}],
                    })
                    i += 1
                nodes.append({"type": "bulletList", "content": items})
                continue
            # Numbered list
            elif _is_ordered(line):
                items = []
                while i < len(lines) and _is_ordered(lines[i]):
                    text = lines[i].split(". ", 1)[1] if ". " in lines[i] else lines[i]
                    items.append({
                        "type": "listItem",
                        "content": [{"type": "paragraph", "content": _inline(text)}],
                    })
                    i += 1
                nodes.append({"type": "orderedList", "content": items})
                continue
            # Horizontal rule
            elif line.strip() in ("---", "***", "___"):
                nodes.append({"type": "horizontalRule"})
            # Empty line → skip
            elif line.strip() == "":
                pass
            # Normal paragraph
            else:
                nodes.append({"type": "paragraph", "content": _inline(line)})

        i += 1

    return {"type": "doc", "content": nodes or [{"type": "paragraph"}]}


def _is_ordered(line: str) -> bool:
    import re
    return bool(re.match(r"^\d+\. ", line))


def _inline(text: str) -> list[dict]:
    """Split text with **bold** and *italic* markers into Tiptap inline nodes."""
    import re
    nodes: list[dict] = []
    pattern = re.compile(r"\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`")
    last = 0
    for m in pattern.finditer(text):
        if m.start() > last:
            nodes.append({"type": "text", "text": text[last:m.start()]})
        if m.group(1) is not None:
            nodes.append({"type": "text", "text": m.group(1), "marks": [{"type": "bold"}]})
        elif m.group(2) is not None:
            nodes.append({"type": "text", "text": m.group(2), "marks": [{"type": "italic"}]})
        elif m.group(3) is not None:
            nodes.append({"type": "text", "text": m.group(3), "marks": [{"type": "code"}]})
        last = m.end()
    if last < len(text):
        nodes.append({"type": "text", "text": text[last:]})
    return nodes or [{"type": "text", "text": text}]


skill = CreateNoteSkill()
