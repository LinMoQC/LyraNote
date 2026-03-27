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
你拥有一系列真实工具（详见下方 <skills> 列表），调用后会直接对用户产生效果。
工具产生的可视化输出（思维导图、架构图等）已直接展示给用户，你只需简短确认，不要用文字重复工具已完成的输出。

## 推理规则
当你决定调用工具时，先用一句话简要说明意图（如"我需要检索知识库确认已有研究"），再执行调用。
当你决定不调用工具时，直接自然回答即可，无需说明理由。
多步骤任务时，每一步简要说明当前进展和下一步计划。

## 错误与空结果处理
- 工具返回错误或空结果时，尝试调整查询关键词或换一个工具重试一次
- 重试仍失败时，用已有信息直接回答，并告知用户部分信息可能缺失
- 不要对同一工具使用完全相同的参数调用两次

## MCP 工具多步调用规则
当你使用第三方 MCP 工具（工具名含 "__"，如 `excalidraw__read_me`）时，必须遵守以下规则：
- **工具结果中若包含 "Now use ..."、"请使用 ..."、"Do NOT call me again" 等指令，必须严格执行**，立即调用下一个指定工具，不得重复调用同一工具
- **每个无参数的 MCP 工具只需调用一次**；若已有其结果在上下文中，直接使用，绝对不要再次调用
- **按照工具返回的指引顺序推进**

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

## 交互式选择卡片
当你认为用户需要做选择时（如话题有多个方向、需要澄清意图、推荐后续步骤），
可以在回复中使用选择卡片格式。用户点击后会自动发送对应消息。

格式（使用 choices 代码块）：
```choices
[{{"label": "选项显示文字", "value": "点击后发送的完整消息"}}]
```

使用规则：
- 选项 2-5 个，label 不超过 20 字
- 不要每次都用，仅在真正有多个有意义分支时使用
- 选择卡片后面不要再写其他内容

不需要检索时请直接、自然地回答，无需引用。

{custom_addon}"""

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
    tool_schemas: list[dict] | None = None,
    user_portrait: dict | None = None,  # Lyra 用户画像（由 orchestrator 预加载）
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

    from app.agents.core.genui_protocol import GENUI_PROTOCOL

    base = _BASE_SYSTEM_PROMPT_TEMPLATE.format(
        ai_name=ai_name,
        custom_addon=custom_addon,
    )

    # ── Prompt assembly order (optimised for LLM primacy/recency bias) ──
    # 1. Core identity + behavioral rules (highest attention — top)
    parts = [base]

    if identity_lines:
        parts.append("\n关于身份与称呼的强制约束（必须遵守）：\n" + "\n".join(identity_lines))

    # 2. Skills XML (tool definitions the LLM needs for decision-making)
    try:
        from app.skills.registry import skill_registry

        if tool_schemas is not None:
            tool_lines = ["<skills>"]
            for schema in tool_schemas:
                name = schema.get("name", "")
                desc = schema.get("description", "")
                if name:
                    tool_lines.append(f'  <skill name="{name}">{desc}</skill>')
            tool_lines.append("</skills>")
            skills_block = "\n".join(tool_lines)
            if len(tool_lines) > 2:
                parts.append(f"\n{skills_block}")
                parts.append(
                    "\n回复前扫描上方 <skills> 列表：\n"
                    "- 有且仅有一个 skill 明确适用时，调用该工具并参考下方对应的技能知识库指引；\n"
                    "- 多个 skill 可能适用时，选最具体的那个；\n"
                    "- 无明确匹配时直接回答，无需调用工具。"
                )
        else:
            active_skills = [s for s in skill_registry.all_skills() if s.passes_gating()]
            if active_skills:
                skills_block = skill_registry.format_skills_for_prompt(active_skills)
                if skills_block:
                    parts.append(f"\n{skills_block}")
                    parts.append(
                        "\n回复前扫描上方 <skills> 列表：\n"
                        "- 有且仅有一个 skill 明确适用时，调用该工具并参考下方对应的技能知识库指引；\n"
                        "- 多个 skill 可能适用时，选最具体的那个；\n"
                        "- 无明确匹配时直接回答，无需调用工具。"
                    )
    except Exception:
        pass

    # 3. Dynamic context (memory, user profile, notebook — middle zone)
    try:
        from app.agents.memory import get_memory_doc_content, get_recent_diary_notes
        memory_content = get_memory_doc_content()
        if memory_content.strip():
            parts.append(f"\n## 关于用户的长期记忆\n{memory_content.strip()}")
        diary_notes = await get_recent_diary_notes(limit=3)
        if diary_notes:
            parts.append(f"\n## 近期对话摘要\n{diary_notes}")
    except Exception:
        pass

    # 3b. User portrait — inject when portrait is passed directly (multi-agent path)
    # The orchestrator pre-loads the portrait and injects it via the `portrait` kwarg.
    # This block handles the direct kwarg injection path.
    if user_portrait:
        try:
            identity = user_portrait.get("identity_summary", "")
            trajectory = user_portrait.get("research_trajectory", {})
            current_focus = trajectory.get("current_focus", "")
            expertise = user_portrait.get("identity", {}).get("expertise_level", "")
            answer_fmt = user_portrait.get("interaction_style", {}).get("answer_format", "")
            lyra_notes = user_portrait.get("lyra_service_notes", "")
            portrait_lines = []
            if identity:
                portrait_lines.append(identity)
            if current_focus:
                portrait_lines.append(f"当前研究重心：{current_focus}")
            if expertise:
                portrait_lines.append(f"知识水平：{expertise}")
            if answer_fmt:
                portrait_lines.append(f"偏好回答格式：{answer_fmt}")
            if lyra_notes:
                portrait_lines.append(f"Lyra 注意：{lyra_notes}")
            if portrait_lines:
                parts.append("\n## Lyra 对你的长期认知（用户画像）\n" + "\n".join(portrait_lines))
        except Exception:
            pass

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

    # 4. Scene instruction
    if scene_instruction:
        parts.append(f"\n{scene_instruction}")

    # 5. Skill guidance bodies (knowledge/workflow SKILL.md files)
    try:
        md_block = skill_registry.format_md_skills_for_prompt()
        if md_block:
            parts.append(f"\n## 技能知识库\n以下是各技能的详细操作指引，当你决定调用对应工具时，遵循相关章节的规范：\n\n{md_block}")
    except Exception:
        pass

    # 6. GenUI protocol (output formatting — lower priority, moved down)
    parts.append(f"\n{GENUI_PROTOCOL}")

    # 7. End-of-prompt reinforcement (recency bias — bottom)
    parts.append(
        "\n## 关键提醒\n"
        "- 引用必须用半角 [来源N]，禁止全角【】\n"
        "- 不要重复调用已有结果的工具\n"
        "- 工具失败时调整参数重试或直接回答"
    )

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
    *,
    extra_graph_context: str | None = None,
) -> tuple[str, list[dict]]:
    """Non-streaming: return (answer_text, citations)."""
    from app.providers.llm import chat

    context, citations = _build_context(chunks)
    eg = (extra_graph_context or "").strip()
    if eg:
        context = (
            f"## 结构化知识关联（图谱）\n{eg}\n\n---\n\n{context}"
            if context
            else f"## 结构化知识关联（图谱）\n{eg}"
        )
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

    async for chunk in chat_stream(messages):
        yield chunk

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
