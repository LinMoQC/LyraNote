"""
Knowledge Graph Agent: extract entities and relations from source text via LLM.
"""

from __future__ import annotations

import json
import logging
from typing import Callable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KnowledgeEntity, KnowledgeRelation, Source

logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """你是一个知识图谱构建助手。请从以下文本中提取知识实体和它们之间的关系。

要求：
1. 提取文本中的重要实体（概念、人物、技术、事件、组织等）
2. 识别实体之间的关系
3. 每个实体需要包含：名称、类型、简短描述
4. 每个关系需要包含：源实体、目标实体、关系类型、描述、权重(0-1)

实体类型（entity_type）只能是以下之一：
- concept: 概念、理论、方法论
- person: 人物
- technology: 技术、工具、软件
- event: 事件
- organization: 组织、机构、公司
- other: 其他

关系类型（relation_type）示例：
- related_to: 相关
- is_part_of: 是...的一部分
- depends_on: 依赖于
- created_by: 由...创建
- used_in: 用于
- leads_to: 导致
- based_on: 基于
- contrasts_with: 对比

请严格以 JSON 格式返回，格式为：
{{
  "entities": [
    {{"name": "实体名", "type": "concept", "description": "简短描述"}}
  ],
  "relations": [
    {{"source": "源实体名", "target": "目标实体名", "type": "related_to", "description": "关系描述", "weight": 0.8}}
  ]
}}

注意：
- 实体名称要简洁明确，不要过长
- 最多提取 30 个实体和 40 个关系
- 只提取文本中明确提及或强烈暗示的关系
- 权重表示关系的强度：1.0 = 非常强的直接关系，0.5 = 中等关系，0.3 = 弱关系

文本：
{text}"""

MAX_TEXT_LENGTH = 8000


async def extract_entities_and_relations(
    source_id: str,
    db: AsyncSession,
) -> None:
    """Extract knowledge entities and relations from a source using LLM."""
    result = await db.execute(select(Source).where(Source.id == UUID(source_id)))
    source = result.scalar_one_or_none()
    if source is None or not source.raw_text:
        logger.warning("Source %s not found or has no text", source_id)
        return

    text = source.raw_text[:MAX_TEXT_LENGTH]
    if len(text.strip()) < 100:
        logger.info("Source %s text too short for graph extraction", source_id)
        return

    from app.providers.llm import chat

    messages = [
        {"role": "system", "content": "你是一个知识图谱构建助手，擅长从文本中提取实体和关系。请严格返回 JSON 格式。"},
        {"role": "user", "content": EXTRACT_PROMPT.format(text=text)},
    ]

    try:
        response = await chat(messages, temperature=0.2)
        data = _parse_json_response(response)
    except Exception as e:
        logger.error("LLM extraction failed for source %s: %s", source_id, e)
        return

    if not data:
        return

    entities_data = data.get("entities", [])
    relations_data = data.get("relations", [])

    entity_map: dict[str, KnowledgeEntity] = {}

    for ent in entities_data:
        name = (ent.get("name") or "").strip()
        entity_type = ent.get("type", "other")
        if not name:
            continue
        if entity_type not in ("concept", "person", "technology", "event", "organization", "other"):
            entity_type = "other"

        existing = await db.execute(
            select(KnowledgeEntity).where(
                KnowledgeEntity.notebook_id == source.notebook_id,
                KnowledgeEntity.name == name,
            )
        )
        entity = existing.scalar_one_or_none()
        if entity:
            entity.mention_count += 1
            if not entity.description and ent.get("description"):
                entity.description = ent["description"][:500]
        else:
            entity = KnowledgeEntity(
                notebook_id=source.notebook_id,
                name=name,
                entity_type=entity_type,
                description=(ent.get("description") or "")[:500] or None,
                source_id=source.id,
                mention_count=1,
            )
            db.add(entity)

        await db.flush()
        entity_map[name] = entity

    for rel in relations_data:
        src_name = (rel.get("source") or "").strip()
        tgt_name = (rel.get("target") or "").strip()
        rel_type = rel.get("type", "related_to")
        if not src_name or not tgt_name or src_name == tgt_name:
            continue

        src_entity = entity_map.get(src_name)
        tgt_entity = entity_map.get(tgt_name)
        if not src_entity or not tgt_entity:
            continue

        weight = rel.get("weight", 0.8)
        if not isinstance(weight, (int, float)):
            weight = 0.8
        weight = max(0.0, min(1.0, float(weight)))

        existing_rel = await db.execute(
            select(KnowledgeRelation).where(
                KnowledgeRelation.source_entity_id == src_entity.id,
                KnowledgeRelation.target_entity_id == tgt_entity.id,
                KnowledgeRelation.notebook_id == source.notebook_id,
            )
        )
        if existing_rel.scalar_one_or_none():
            continue

        relation = KnowledgeRelation(
            notebook_id=source.notebook_id,
            source_entity_id=src_entity.id,
            target_entity_id=tgt_entity.id,
            relation_type=rel_type,
            description=(rel.get("description") or "")[:500] or None,
            weight=weight,
            source_id=source.id,
        )
        db.add(relation)

    await db.flush()
    logger.info(
        "Extracted %d entities and %d relations from source %s",
        len(entity_map), len(relations_data), source_id,
    )


async def rebuild_notebook_graph(
    notebook_id: str,
    db: AsyncSession,
    on_progress: "Callable[[int, int, str], None] | None" = None,
) -> None:
    """Delete all graph data for a notebook and re-extract from all indexed sources."""
    nb_uuid = UUID(notebook_id)

    await db.execute(
        KnowledgeRelation.__table__.delete().where(KnowledgeRelation.notebook_id == nb_uuid)
    )
    await db.execute(
        KnowledgeEntity.__table__.delete().where(KnowledgeEntity.notebook_id == nb_uuid)
    )
    await db.flush()

    result = await db.execute(
        select(Source).where(Source.notebook_id == nb_uuid, Source.status == "indexed")
    )
    sources = result.scalars().all()
    total = len(sources)

    for idx, source in enumerate(sources):
        if on_progress:
            on_progress(idx, total, source.title or str(source.id))
        try:
            await extract_entities_and_relations(str(source.id), db)
        except Exception as e:
            logger.error("Graph extraction failed for source %s: %s", source.id, e)

    if on_progress:
        on_progress(total, total, "")


def _parse_json_response(text: str) -> dict | None:
    """Extract JSON from LLM response, handling markdown code blocks."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # skip ```json
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
    logger.warning("Failed to parse LLM JSON response")
    return None
