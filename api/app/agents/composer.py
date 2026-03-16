"""
Composer Agent: build prompt → call LLM → stream tokens + citations.
Now supports personalised system prompts (User Memory + Notebook Summary).
Also used for Studio artifact generation with different prompt templates.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

ArtifactType = Literal["summary", "faq", "study_guide", "briefing", "outline"]

_BASE_SYSTEM_PROMPT_TEMPLATE = """你是 {ai_name}，一位专属 AI 研究助手，帮助用户深入理解和研究笔记本中的资料。

## 工具使用规则
你拥有以下真实工具，调用后会直接对用户产生效果，不需要用文字重复工具已完成的输出：

- `search_notebook_knowledge`：检索知识库，返回相关资料片段
- `web_search`：搜索互联网实时信息
- `generate_mind_map`：**生成可视化思维导图卡片，调用成功后导图已展示给用户**，你只需简短确认（如"已为你生成思维导图，可在上方查看"），不要再用文字重新输出导图结构
- `summarize_sources`：生成摘要/FAQ/学习指南/大纲等结构化输出
- `deep_read_sources`：对来源进行逐段深度分析，评估论证强度、识别假设与矛盾
- `compare_sources`：对比多个来源的观点异同，生成结构化对比分析
- `create_note_draft`：在笔记本中创建笔记
- `update_user_preference`：记录用户偏好

## 工具选择优先级（重要）
1. **用户消息包含以下任意关键词时，必须优先调用 `web_search`，不得先检索知识库**：
   - "联网"、"搜网"、"上网查"、"网上搜"
   - "最新"、"最近"、"实时"、"当前"、"今年"、"2025"、"2026"
   - "新闻"、"动态"、"进展"、"趋势"
   - "演进"、"发展历史"（涉及近期动态时）
2. 问题涉及知识库已有资料时，优先 `search_notebook_knowledge`
3. 两类信息都需要时，先调 `web_search` 再调 `search_notebook_knowledge`

## 何时直接回答（不调用工具）
- 日常对话、问候、感谢等（如"你好"、"谢谢"、"好的"）
- 澄清性追问、简单确认
- 用户询问你的功能或使用方法
- 上下文中已有足够信息可直接回答的后续问题

## 引用规则（仅当使用了检索到的资料时遵守）
1. 每个来自参考资料的观点在句末标注 [来源N]，N 是资料编号
   - 必须使用半角方括号 [ ]，禁止使用全角【】
   - 正确示例：这是一个观点 [来源1]。
   - 错误示例：这是一个观点【来源1】。
2. 多条资料支持同一观点时同时标注，如 [来源1][来源2]
3. 不要跳过编号

不需要检索时请直接、自然地回答，无需引用。{custom_addon}"""

ARTIFACT_PROMPTS: dict[str, str] = {
    "summary": (
        "请基于以下资料，生成一份简洁、清晰的摘要（300-500字）。"
        "涵盖核心主题、关键观点和重要结论。使用 Markdown 格式。"
    ),
    "faq": (
        "请基于以下资料，生成 5-8 个常见问题与解答（FAQ）。"
        "每个问题应聚焦一个核心知识点，回答简洁。使用 Markdown 格式，Q:/A: 结构。"
    ),
    "study_guide": (
        "请基于以下资料，生成一份学习提纲。"
        "包含主要章节/主题、核心概念定义、重点知识点列表。使用 Markdown 格式，有层级结构。"
    ),
    "briefing": (
        "请基于以下资料，生成一份简报（Briefing）。"
        "包含背景、核心发现、关键数据/引用、结论与建议。使用 Markdown 格式。"
    ),
    "outline": (
        "请基于以下资料，生成一份结构化大纲。"
        "包含主标题、各级子标题、每个部分的核心要点（1-2句话）。"
        "使用 Markdown 多级列表格式，清晰展示层级关系。"
    ),
}


async def build_system_prompt(
    user_memories: list[dict] | None = None,
    notebook_summary: dict | None = None,
    scene_instruction: str | None = None,
    db: "AsyncSession | None" = None,  # kept for API compatibility, not used for memory
) -> str:
    """Compose a personalised system prompt from base + L4 scene + L2/L3 memory + notebook context.

    Memory doc and diary notes are read from local files (file-based memory system).
    The `db` parameter is retained for API compatibility but is no longer used for memory.
    """
    from app.config import settings

    # AI name — priority order (none hardcoded):
    #   1. preferred_ai_name in user_memories (user-set in conversation, checked below)
    #   2. settings.ai_name (synced from app_config DB at startup / config API update)
    #   3. Read app_config table directly via db (in case settings is stale)
    ai_name = (getattr(settings, "ai_name", "") or "").strip()
    if not ai_name and db is not None:
        try:
            from app.models import AppConfig
            from sqlalchemy import select as _select
            _row = (await db.execute(
                _select(AppConfig).where(AppConfig.key == "ai_name")
            )).scalar_one_or_none()
            if _row and _row.value:
                ai_name = _row.value.strip()
                # Refresh in-memory settings to avoid repeated DB reads
                try:
                    settings.ai_name = ai_name
                except Exception:
                    pass
        except Exception:
            pass

    # Optional: inject custom system prompt as an addon block
    custom_system_prompt = getattr(settings, "custom_system_prompt", "") or ""
    custom_addon = f"\n\n## 额外指导\n{custom_system_prompt}" if custom_system_prompt.strip() else ""

    # ------------------------------------------------------------------
    # High-priority identity directives (from memories)
    # ------------------------------------------------------------------
    identity_lines: list[str] = []
    preferred_ai_name: str | None = None
    user_role: str | None = None
    communication_tone: str | None = None

    if user_memories:
        for mem in user_memories:
            key = str(mem.get("key", "")).strip()
            value = str(mem.get("value", "")).strip()
            if not key or not value:
                continue
            if key == "preferred_ai_name":
                preferred_ai_name = value
            elif key == "user_role":
                user_role = value
            elif key == "communication_tone":
                communication_tone = value

    if preferred_ai_name:
        ai_name = preferred_ai_name
        identity_lines.append(f"  - 你的名字/称呼：{preferred_ai_name}（用户明确指定，必须用此名称自我介绍）")
    if user_role:
        identity_lines.append(f"  - 用户身份：{user_role}（请用符合此身份的方式称呼和对待用户）")
    if communication_tone:
        identity_lines.append(f"  - 语气风格：{communication_tone}（所有回复必须体现此语气）")

    # Final safety: if still empty (e.g. fresh install before setup wizard runs),
    # use a neutral placeholder so the template renders meaningfully.
    if not ai_name:
        ai_name = "AI 助手"

    base = _BASE_SYSTEM_PROMPT_TEMPLATE.format(
        ai_name=ai_name,
        custom_addon=custom_addon,
    )
    parts = [base]

    if identity_lines:
        parts.append("\n关于身份与称呼的强制约束（必须遵守）：\n" + "\n".join(identity_lines))

    # Skills: inject available tool skills XML block + Markdown skill guidance bodies
    try:
        from app.skills.registry import skill_registry

        # XML block listing callable tool skills
        active_skills = [s for s in skill_registry.all_skills() if s.passes_gating()]
        if active_skills:
            skills_block = skill_registry.format_skills_for_prompt(active_skills)
            if skills_block:
                parts.append(f"\n{skills_block}")

        # Markdown skill guidance bodies (knowledge/workflow SKILL.md files)
        md_block = skill_registry.format_md_skills_for_prompt()
        if md_block:
            parts.append(f"\n## 技能知识库\n{md_block}")
    except Exception:
        pass

    # Global evergreen memory doc + recent diary notes (file-based, no DB needed)
    try:
        from app.agents.memory import get_memory_doc_content, get_recent_diary_notes
        memory_content = get_memory_doc_content()
        if memory_content.strip():
            parts.append(f"\n## 关于用户的长期记忆\n{memory_content.strip()}")
        # Recent diary notes (up to 3 most recent)
        diary_notes = await get_recent_diary_notes(limit=3)
        if diary_notes:
            parts.append(f"\n## 近期对话摘要\n{diary_notes}")
    except Exception:
        pass  # Non-critical: proceed without memory if file read fails

    # L4: scene-specific behaviour directive
    if scene_instruction:
        parts.append(f"\n{scene_instruction}")

    # Inject user occupation + preferences from setup as persistent context
    occupation = getattr(settings, "user_occupation", "") or ""
    preferences = getattr(settings, "user_preferences", "") or ""
    if occupation or preferences:
        profile_lines = []
        if occupation:
            profile_lines.append(f"  - 职业：{occupation}")
        if preferences:
            profile_lines.append(f"  - 偏好/兴趣：{preferences}")
        parts.append(
            "\n关于用户的基本信息（来自初始化配置）：\n" + "\n".join(profile_lines)
        )

    # L2/L3: dynamic user memory context (learned from conversations)
    if user_memories:
        high_conf = [m for m in user_memories if m.get("confidence", 0) >= 0.3]
        if high_conf:
            mem_lines = "\n".join(f"  - {m['key']}: {m['value']}" for m in high_conf)
            parts.append(
                f"\n从对话中学到的用户偏好，请据此调整回答风格和侧重：\n{mem_lines}"
            )

    if notebook_summary and notebook_summary.get("summary_md"):
        themes = "、".join(notebook_summary.get("key_themes") or [])
        nb_ctx = f"\n当前笔记本研究背景：{notebook_summary['summary_md']}"
        if themes:
            nb_ctx += f"\n核心主题：{themes}"
        parts.append(nb_ctx)

    return "\n".join(parts)


def _build_context(chunks: list[dict]) -> tuple[str, list[dict]]:
    """Build the context block from retrieved chunks, return (context_text, citations)."""
    context_parts = []
    citations = []

    for i, chunk in enumerate(chunks, start=1):
        context_parts.append(
            f"[来源{i}] 《{chunk['source_title']}》\n{chunk['content']}"
        )
        citations.append(
            {
                "source_id": chunk["source_id"],
                "chunk_id": chunk["chunk_id"],
                "excerpt": chunk["excerpt"],
                "source_title": chunk["source_title"],
            }
        )

    return "\n\n---\n\n".join(context_parts), citations


async def compose_answer(
    query: str,
    chunks: list[dict],
    history: list[dict],
    user_memories: list[dict] | None = None,
    notebook_summary: dict | None = None,
    db: "AsyncSession | None" = None,
) -> tuple[str, list[dict]]:
    """Non-streaming: return (answer_text, citations)."""
    from app.providers.llm import chat

    context, citations = _build_context(chunks)
    messages = await _build_messages(query, context, history, user_memories, notebook_summary, db)
    answer = await chat(messages)
    return answer, citations


async def stream_answer(
    query: str,
    chunks: list[dict],
    history: list[dict],
    user_memories: list[dict] | None = None,
    notebook_summary: dict | None = None,
    db: "AsyncSession | None" = None,
) -> AsyncGenerator[dict, None]:
    """
    Streaming: yield dicts of shape:
      {"type": "token",     "content": "..."}
      {"type": "citations", "citations": [...]}
      {"type": "done"}
    """
    from app.providers.llm import chat_stream

    context, citations = _build_context(chunks)
    messages = await _build_messages(query, context, history, user_memories, notebook_summary, db)

    async for token in chat_stream(messages):
        yield {"type": "token", "content": token}

    yield {"type": "citations", "citations": citations}
    yield {"type": "done"}


async def generate_artifact(
    artifact_type: ArtifactType,
    chunks: list[dict],
) -> str:
    """Generate a Studio artifact. Returns the full Markdown string."""
    from app.providers.llm import chat

    context, _ = _build_context(chunks)
    instruction = ARTIFACT_PROMPTS.get(artifact_type, ARTIFACT_PROMPTS["summary"])

    messages = [
        {"role": "system", "content": instruction},
        {
            "role": "user",
            "content": f"以下是参考资料：\n\n{context}",
        },
    ]
    return await chat(messages, temperature=0.5)


async def _build_messages(
    query: str,
    context: str,
    history: list[dict],
    user_memories: list[dict] | None = None,
    notebook_summary: dict | None = None,
    db: "AsyncSession | None" = None,
) -> list[dict]:
    system = await build_system_prompt(user_memories, notebook_summary, db=db)
    messages: list[dict] = [{"role": "system", "content": system}]

    if context:
        messages.append(
            {
                "role": "user",
                "content": f"以下是本次问答的参考资料：\n\n{context}",
            }
        )
        messages.append(
            {"role": "assistant", "content": "好的，我已经阅读了参考资料，请提问。"}
        )

    # Include recent history (skip the injected context exchange above)
    messages.extend(history[-10:])

    # Current user query
    messages.append({"role": "user", "content": query})
    return messages
