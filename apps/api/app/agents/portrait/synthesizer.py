"""
用户画像合成引擎

将碎片化的 user_memories（key-value）+ agent_reflections（反思记录）
合成为一份立体的六维用户画像 JSON，代表 Lyra 对「这个人是谁」的深度认知。

合成时机：
  1. Celery Beat 每周一凌晨 3 点（全量）
  2. 用户累计完成 20 次新对话后（活跃用户更新）
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# 画像合成 Prompt
_PORTRAIT_SYNTHESIS_PROMPT = """你是 Lyra，一个深度理解用户的 AI 研究伙伴。
基于以下长期积累的信息，为该用户生成一份立体的用户画像。

=== 记忆碎片（共 {memory_count} 条）===
{memories_text}

=== 对话质量反思记录（近 {reflection_count} 条）===
{reflections_text}

=== 上一版画像摘要 ===
{previous_portrait}

请生成深度用户画像，严格输出以下 JSON 格式（不要加 markdown 代码块）：
{{
  "identity_summary": "2-3句话，Lyra 对该用户的整体认知（自然语言，像内心白话）",
  "identity": {{
    "primary_role": "主要身份/职业",
    "expertise_level": "初学者/中级/高级/专家",
    "personality_type": "性格类型描述",
    "confidence": 0.85
  }},
  "knowledge_map": {{
    "expert_domains": ["已掌握领域1", "已掌握领域2"],
    "learning_domains": ["正在学习的领域"],
    "weak_domains": ["薄弱领域"],
    "emerging_interest": ["新兴兴趣方向"]
  }},
  "work_patterns": {{
    "prefers_deep_focus": true,
    "writing_to_reading_ratio": 0.4,
    "session_style": "描述工作习惯"
  }},
  "research_trajectory": {{
    "current_focus": "当前研究重心",
    "recently_completed": ["近期完成/掌握的主题"],
    "next_likely_topics": ["可能探索的下一个话题"],
    "long_term_direction": "长期方向"
  }},
  "interaction_style": {{
    "preferred_depth": "偏好的回答深度",
    "answer_format": "偏好的答案格式",
    "preferred_language": "中文",
    "engagement_style": "互动风格"
  }},
  "growth_signals": {{
    "knowledge_velocity": "low/medium/high",
    "this_period_learned": ["这段时间新学到的"],
    "recurring_questions": ["反复提问的话题"],
    "knowledge_gaps_detected": ["检测到的知识盲区"]
  }},
  "lyra_service_notes": "Lyra 需要特别注意的个性化服务点（对话时的注意事项）"
}}

要求：
1. 不要只列举记忆——综合理解「这个人是谁、有什么特点」
2. 推断用户的研究轨迹和成长方向
3. identity_summary 写成 Lyra 对用户的内心独白，自然、有温度
4. 数据不足时 confidence 设低一点（0.3-0.5），不要过度推断
"""


async def synthesize_portrait(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> dict:
    """
    为指定用户合成用户画像，返回画像 JSON dict 并保存到 user_portraits 表。

    如数据量不足（< 3 条记忆），返回空画像占位符而非强制合成。
    """
    from app.models import AgentReflection, UserMemory, UserPortrait
    from app.providers.llm import chat
    from app.providers.llm import get_utility_model
    from app.services.memory_service import MemoryService

    await MemoryService(db, user_id).cleanup_runtime_memories()

    # ── 1. 加载记忆碎片 ──────────────────────────────────────────────────────
    mem_rows = (
        await db.execute(
            select(UserMemory)
            .where(UserMemory.user_id == user_id)
            .order_by(UserMemory.updated_at.desc())
            .limit(60)
        )
    ).scalars().all()

    if len(mem_rows) < 3:
        logger.info("User %s has too few memories (%d) for portrait synthesis", user_id, len(mem_rows))
        return {}

    memories_text = "\n".join(
        f"  [{m.memory_type}] {m.key}: {m.value}（信度 {m.confidence:.1f}）"
        for m in mem_rows
    )

    # ── 2. 加载反思记录 ─────────────────────────────────────────────────────
    since = datetime.now(timezone.utc) - timedelta(days=30)
    ref_rows = (
        await db.execute(
            select(AgentReflection)
            .where(
                AgentReflection.user_id == user_id,
                AgentReflection.created_at >= since,
            )
            .order_by(AgentReflection.created_at.desc())
            .limit(20)
        )
    ).scalars().all()

    reflections_text = "\n".join(
        f"  场景={r.scene} 质量={r.quality_score} 有效={r.what_worked} 不足={r.what_failed}"
        for r in ref_rows
        if r.what_worked or r.what_failed
    ) or "（暂无反思记录）"

    # ── 3. 加载上一版画像摘要 ────────────────────────────────────────────────
    prev_row = (
        await db.execute(
            select(UserPortrait).where(UserPortrait.user_id == user_id)
        )
    ).scalar_one_or_none()

    previous_portrait = (
        prev_row.synthesis_summary
        if prev_row and prev_row.synthesis_summary
        else "（首次合成）"
    )

    # ── 4. LLM 合成 ─────────────────────────────────────────────────────────
    prompt = _PORTRAIT_SYNTHESIS_PROMPT.format(
        memory_count=len(mem_rows),
        memories_text=memories_text,
        reflection_count=len(ref_rows),
        reflections_text=reflections_text,
        previous_portrait=previous_portrait,
    )

    raw = await chat(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1800,
    )

    portrait_json = _parse_portrait_json(raw)
    if not portrait_json:
        logger.warning("Portrait synthesis returned unparseable JSON for user=%s", user_id)
        return {}

    identity_summary = portrait_json.get("identity_summary", "")

    # ── 5. 生成变化摘要（delta）───────────────────────────────────────────────
    delta_summary: str | None = None
    if prev_row and prev_row.portrait_json:
        try:
            delta_prompt = (
                f"上一版画像：{json.dumps(prev_row.portrait_json, ensure_ascii=False)[:500]}\n"
                f"新版画像：{json.dumps(portrait_json, ensure_ascii=False)[:500]}\n"
                "用一句话概括这段时间 Lyra 对用户的认知发生了哪些变化（中文，≤50字）："
            )
            delta_summary = (
                await chat(
                    messages=[{"role": "user", "content": delta_prompt}],
                    model=get_utility_model(),
                    temperature=0.3,
                    max_tokens=500,
                )
            ).strip()
        except Exception:
            pass

    # ── 6. 持久化 ───────────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    if prev_row:
        prev_row.portrait_json = portrait_json
        prev_row.synthesis_summary = identity_summary
        prev_row.version = (prev_row.version or 1) + 1
        prev_row.synthesized_at = now
        prev_row.updated_at = now
    else:
        portrait_row = UserPortrait(
            user_id=user_id,
            portrait_json=portrait_json,
            synthesis_summary=identity_summary,
            version=1,
            synthesized_at=now,
        )
        db.add(portrait_row)

    await db.commit()
    logger.info("Portrait synthesized for user=%s (memories=%d)", user_id, len(mem_rows))
    return portrait_json


def _parse_portrait_json(raw: str) -> dict | None:
    """从 LLM 响应中提取 JSON。兼容 markdown code block 包裹。"""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        text = "\n".join(inner)
    try:
        result = json.loads(text)
        return result if isinstance(result, dict) else None
    except json.JSONDecodeError:
        # 尝试找 JSON 对象边界
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
    return None
