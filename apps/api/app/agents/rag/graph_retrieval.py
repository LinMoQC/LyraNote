"""
GraphRAG retrieval augmentation.

Enriches RAG answers with structural knowledge from the knowledge graph.
When a query mentions entities already present in the graph, this module:
  1. Matches those entities via fuzzy DB lookup (no LLM, < 10 ms).
  2. Expands to their 1-hop neighbourhood (related entities + edges).
  3. Formats the subgraph as readable text that is prepended to the LLM
     context, supplying relational knowledge that chunk retrieval alone
     cannot provide.

The public entry point `graph_augmented_context` is safe to call on every
request: it returns "" when no entities match or on any DB error, so it
never blocks the main RAG path.
"""

from __future__ import annotations

import logging
import re
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KnowledgeEntity, KnowledgeRelation

logger = logging.getLogger(__name__)

# Maximum entities/relations included in the injected context to avoid
# overwhelming the context window.
_MAX_SEED_ENTITIES = 10
_MAX_NEIGHBOR_ENTITIES = 20
_MAX_RELATIONS = 30

# Query terms shorter than this character count are skipped (stop words, etc.)
_MIN_TERM_CHARS = 2

# First line of formatted graph context (shared with tests).
GRAPH_CONTEXT_BANNER = "=== 知识图谱结构信息（仅供参考，不作为引用来源）==="


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _tokenize_query(query: str) -> list[str]:
    """
    Split query into candidate search terms.

    Splits on whitespace and CJK-aware punctuation, deduplicates, and
    filters out single-character tokens that are unlikely entity names.
    Also keeps multi-word n-grams up to 4 consecutive tokens to match
    compound entity names like "深度学习" or "transformer architecture".
    """
    # Split on whitespace and common punctuation
    raw_tokens = re.split(r"[\s，。？！、：；,.?!:;]+", query.strip())
    tokens = [t.strip() for t in raw_tokens if len(t.strip()) >= _MIN_TERM_CHARS]

    # Build bigrams and trigrams to catch multi-word entity names
    ngrams: list[str] = []
    for n in (2, 3, 4):
        for i in range(len(tokens) - n + 1):
            phrase = " ".join(tokens[i : i + n])
            ngrams.append(phrase)
            # Also concatenated (for Chinese compound words)
            ngrams.append("".join(tokens[i : i + n]))

    return list(dict.fromkeys(tokens + ngrams))  # preserve order, deduplicate


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

async def match_entities_from_query(
    query: str,
    notebook_id: str | None,
    db: AsyncSession,
) -> list[KnowledgeEntity]:
    """
    Fuzzy-match query terms against KnowledgeEntity.name in the DB.

    Uses PostgreSQL ILIKE so it works without any additional index beyond
    the existing name column.  Returns at most _MAX_SEED_ENTITIES entities,
    ordered by mention_count descending (more prominent entities first).
    """
    if not query or not query.strip():
        return []

    terms = _tokenize_query(query)
    if not terms:
        return []

    # Build OR conditions: one ILIKE clause per term
    ilike_conditions = [KnowledgeEntity.name.ilike(f"%{term}%") for term in terms]

    stmt = select(KnowledgeEntity).where(or_(*ilike_conditions))
    if notebook_id:
        try:
            stmt = stmt.where(KnowledgeEntity.notebook_id == UUID(notebook_id))
        except ValueError:
            pass

    stmt = stmt.order_by(KnowledgeEntity.mention_count.desc()).limit(_MAX_SEED_ENTITIES)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def expand_entity_neighborhood(
    seed_entity_ids: list[UUID],
    notebook_id: str | None,
    db: AsyncSession,
    hops: int = 1,
) -> tuple[list[KnowledgeEntity], list[KnowledgeRelation]]:
    """
    Return (entities, relations) within *hops* distance of the seed entities.

    For hops=1 (default):
      - Fetches all KnowledgeRelation rows where either end is a seed entity.
      - Collects the neighbour entity IDs from those relations.
      - Fetches the neighbour KnowledgeEntity rows.

    Returns (all_entities_in_subgraph, all_relations_in_subgraph).
    The seed entities themselves are NOT included in the returned entity list
    (callers already have them); only neighbours are returned.
    """
    if not seed_entity_ids:
        return [], []

    all_relations: list[KnowledgeRelation] = []
    frontier: set[UUID] = set(seed_entity_ids)
    visited: set[UUID] = set(seed_entity_ids)
    neighbour_ids: set[UUID] = set()

    for _ in range(hops):
        if not frontier:
            break

        rel_stmt = (
            select(KnowledgeRelation)
            .where(
                or_(
                    KnowledgeRelation.source_entity_id.in_(frontier),
                    KnowledgeRelation.target_entity_id.in_(frontier),
                )
            )
            .order_by(KnowledgeRelation.weight.desc())
            .limit(_MAX_RELATIONS)
        )
        if notebook_id:
            try:
                rel_stmt = rel_stmt.where(
                    KnowledgeRelation.notebook_id == UUID(notebook_id)
                )
            except ValueError:
                pass

        rel_result = await db.execute(rel_stmt)
        new_relations = list(rel_result.scalars().all())
        all_relations.extend(new_relations)

        # Collect unseen neighbour IDs for the next hop
        new_frontier: set[UUID] = set()
        for rel in new_relations:
            for eid in (rel.source_entity_id, rel.target_entity_id):
                if eid not in visited:
                    new_frontier.add(eid)
                    neighbour_ids.add(eid)
        visited.update(new_frontier)
        frontier = new_frontier

    if not neighbour_ids:
        return [], all_relations

    # Fetch neighbour entity details
    neighbour_ids_list = list(neighbour_ids)[: _MAX_NEIGHBOR_ENTITIES]
    ent_stmt = select(KnowledgeEntity).where(
        KnowledgeEntity.id.in_(neighbour_ids_list)
    )
    ent_result = await db.execute(ent_stmt)
    neighbours = list(ent_result.scalars().all())

    return neighbours, all_relations


def format_graph_context(
    seed_entities: list[KnowledgeEntity],
    neighbour_entities: list[KnowledgeEntity],
    relations: list[KnowledgeRelation],
) -> str:
    """
    Format a knowledge-graph subgraph as a readable text block.

    Example output::

        === 知识图谱结构信息（仅供参考，不作为引用来源）===
        实体：深度学习（technology）— 通过多层神经网络学习特征表示的机器学习范式
        实体：神经网络（concept）— 由节点和权重组成的计算图
        关系：深度学习 --基于--> 神经网络（权重 0.9）
        关系：深度学习 --用于--> 自然语言处理（权重 0.8）

    Returns "" if there are no entities and no relations to display.
    """
    all_entities = list({e.id: e for e in seed_entities + neighbour_entities}.values())
    if not all_entities and not relations:
        return ""

    entity_map: dict[UUID, str] = {e.id: e.name for e in all_entities}

    lines: list[str] = [GRAPH_CONTEXT_BANNER]

    for entity in all_entities:
        desc = f"— {entity.description}" if entity.description else ""
        lines.append(f"实体：{entity.name}（{entity.entity_type}）{desc}")

    # Deduplicate relations by (source, target, type)
    seen_rels: set[tuple[UUID, UUID, str]] = set()
    for rel in sorted(relations, key=lambda r: r.weight, reverse=True):
        key = (rel.source_entity_id, rel.target_entity_id, rel.relation_type)
        if key in seen_rels:
            continue
        seen_rels.add(key)
        src_name = entity_map.get(rel.source_entity_id, str(rel.source_entity_id))
        tgt_name = entity_map.get(rel.target_entity_id, str(rel.target_entity_id))
        lines.append(
            f"关系：{src_name} --{rel.relation_type}--> {tgt_name}（权重 {rel.weight:.1f}）"
        )

    return "\n".join(lines)


async def graph_augmented_context(
    query: str,
    notebook_id: str | None,
    db: AsyncSession,
) -> str:
    """
    Public entry point: return a graph-context string to prepend to RAG results.

    Returns "" when:
    - No entities in the graph match the query terms.
    - The notebook has no graph data yet.
    - Any DB error occurs (fail-open: never blocks the main RAG path).
    """
    try:
        seed_entities = await match_entities_from_query(query, notebook_id, db)
        if not seed_entities:
            return ""

        seed_ids = [e.id for e in seed_entities]
        neighbours, relations = await expand_entity_neighborhood(
            seed_ids, notebook_id, db
        )

        ctx = format_graph_context(seed_entities, neighbours, relations)
        if ctx:
            logger.info(
                "graph_rag query=%r seed_entities=%d neighbours=%d relations=%d",
                query[:80],
                len(seed_entities),
                len(neighbours),
                len(relations),
            )
        return ctx

    except Exception as exc:
        logger.warning("graph_augmented_context failed (non-fatal): %s", exc)
        return ""
