"""
Writing Agent: inline AI actions for the Tiptap editor.
- Ghost Text suggestion (autocomplete)
- Selection rewrite (polish / shorten / expand)
"""

from typing import Literal

RewriteAction = Literal["polish", "shorten", "expand"]

REWRITE_PROMPTS: dict[str, str] = {
    "polish": (
        "请对以下文字进行润色，使其表达更流畅、专业。保持原意，不要大幅改写。"
        "直接输出改写后的文字，不加任何解释。"
    ),
    "shorten": (
        "请将以下文字进行精简，在保留核心信息的前提下尽量缩短。"
        "直接输出精简后的文字，不加任何解释。"
    ),
    "expand": (
        "请对以下文字进行扩写，补充细节、论据或示例，使内容更丰富完整。"
        "直接输出扩写后的文字，不加任何解释。"
    ),
}


async def suggest_continuation(
    note_context: str,
    cursor_text: str,
) -> str:
    """
    Return a short Ghost Text suggestion (1-2 sentences) to continue after cursor_text.
    note_context: the full text of the current note (for context injection)
    cursor_text: text immediately before the cursor position
    """
    from app.providers.llm import chat

    messages = [
        {
            "role": "system",
            "content": (
                "你是一个写作助手。根据用户的笔记内容和当前光标位置，"
                "续写 1-2 句话（不超过 60 字）。直接输出续写内容，不加任何前缀或解释。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"笔记内容（供参考）：\n{note_context[:1500]}\n\n"
                f"光标前的文字：\n{cursor_text[-500:]}\n\n"
                "请续写："
            ),
        },
    ]
    return await chat(messages, temperature=0.8)


async def rewrite_selection(
    selected_text: str,
    action: RewriteAction,
    note_context: str = "",
) -> str:
    """
    Rewrite selected_text according to action.
    Returns the rewritten text only.
    """
    from app.providers.llm import chat

    system_prompt = REWRITE_PROMPTS[action]
    context_block = f"\n\n（笔记背景：{note_context[:500]}）" if note_context else ""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"{selected_text}{context_block}"},
    ]
    return await chat(messages, temperature=0.6)
