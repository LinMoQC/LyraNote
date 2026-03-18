"""
Knowledge Graph domain: query, rebuild, and manage knowledge entities and relations.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select, func, delete

from app.dependencies import CurrentUser, DbDep
from app.exceptions import NotFoundError
from app.models import KnowledgeEntity, KnowledgeRelation, Source
from app.schemas.response import ApiResponse, success

router = APIRouter(tags=["knowledge-graph"])


# ── Response schemas ──────────────────────────────────────────────────────────

class GraphNodeOut(BaseModel):
    id: str
    name: str
    type: str
    description: str | None = None
    mention_count: int = 1

class GraphLinkOut(BaseModel):
    source: str
    target: str
    relation_type: str
    description: str | None = None
    weight: float = 1.0

class GraphDataOut(BaseModel):
    nodes: list[GraphNodeOut]
    links: list[GraphLinkOut]

class EntityDetailOut(BaseModel):
    id: str
    name: str
    type: str
    description: str | None = None
    mention_count: int
    source_title: str | None = None
    relations: list[dict]

class RebuildStatusOut(BaseModel):
    status: str

class RebuildProgressOut(BaseModel):
    current: int = 0
    total: int = 0
    source_title: str = ""
    status: str = "idle"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _build_graph(db, notebook_ids: list[UUID]) -> GraphDataOut:
    """Build graph data from one or more notebooks."""
    entities_result = await db.execute(
        select(KnowledgeEntity).where(KnowledgeEntity.notebook_id.in_(notebook_ids))
    )
    entities = entities_result.scalars().all()

    entity_ids = [e.id for e in entities]
    nodes = [
        GraphNodeOut(
            id=str(e.id),
            name=e.name,
            type=e.entity_type,
            description=e.description,
            mention_count=e.mention_count,
        )
        for e in entities
    ]

    if not entity_ids:
        return GraphDataOut(nodes=[], links=[])

    relations_result = await db.execute(
        select(KnowledgeRelation).where(
            KnowledgeRelation.notebook_id.in_(notebook_ids),
            KnowledgeRelation.source_entity_id.in_(entity_ids),
            KnowledgeRelation.target_entity_id.in_(entity_ids),
        )
    )
    relations = relations_result.scalars().all()

    links = [
        GraphLinkOut(
            source=str(r.source_entity_id),
            target=str(r.target_entity_id),
            relation_type=r.relation_type,
            description=r.description,
            weight=r.weight,
        )
        for r in relations
    ]

    return GraphDataOut(nodes=nodes, links=links)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get(
    "/notebooks/{notebook_id}/knowledge-graph",
    response_model=ApiResponse[GraphDataOut],
)
async def get_notebook_graph(
    notebook_id: UUID,
    _current_user: CurrentUser,
    db: DbDep,
):
    """Get knowledge graph data for a specific notebook."""
    data = await _build_graph(db, [notebook_id])
    return success(data)


@router.get(
    "/knowledge-graph/global",
    response_model=ApiResponse[GraphDataOut],
)
async def get_global_graph(
    _current_user: CurrentUser,
    db: DbDep,
):
    """Get the global knowledge graph across all user notebooks."""
    from app.models import Notebook
    result = await db.execute(
        select(Notebook.id).where(Notebook.user_id == _current_user.id)
    )
    notebook_ids = [row for row in result.scalars().all()]
    if not notebook_ids:
        return success(GraphDataOut(nodes=[], links=[]))
    data = await _build_graph(db, notebook_ids)
    return success(data)


@router.post(
    "/notebooks/{notebook_id}/knowledge-graph/rebuild",
    response_model=ApiResponse[RebuildStatusOut],
)
async def rebuild_graph(
    notebook_id: UUID,
    _current_user: CurrentUser,
    db: DbDep,
):
    """Trigger a full rebuild of the knowledge graph for a notebook."""
    try:
        from app.workers.tasks import rebuild_knowledge_graph_task
        rebuild_knowledge_graph_task.delay(str(notebook_id))
        return success(RebuildStatusOut(status="started"))
    except Exception:
        from app.agents.kg.knowledge_graph import rebuild_notebook_graph
        await rebuild_notebook_graph(str(notebook_id), db)
        await db.commit()
        return success(RebuildStatusOut(status="completed"))


@router.post(
    "/knowledge-graph/rebuild-all",
    response_model=ApiResponse[RebuildStatusOut],
)
async def rebuild_all_graphs(
    _current_user: CurrentUser,
    db: DbDep,
):
    """Trigger a rebuild of the knowledge graph for ALL user notebooks."""
    import json as _json
    import redis
    from app.config import settings
    from app.models import Notebook, Source

    user_id = str(_current_user.id)

    result = await db.execute(
        select(Notebook.id).where(
            Notebook.user_id == _current_user.id,
            Notebook.status == "active",
        )
    )
    notebook_ids = [row for row in result.scalars().all()]

    total_sources = 0
    for nb_id in notebook_ids:
        cnt = await db.execute(
            select(func.count()).select_from(Source).where(
                Source.notebook_id == nb_id, Source.status == "indexed"
            )
        )
        total_sources += cnt.scalar() or 0

    r = redis.from_url(settings.redis_url, decode_responses=True)
    progress_key = f"kg:rebuild_progress:{user_id}"
    r.delete(f"{progress_key}:done")
    r.set(f"{progress_key}:total", total_sources, ex=300)
    r.set(
        progress_key,
        _json.dumps({"current": 0, "total": total_sources, "source_title": "", "status": "processing"}),
        ex=300,
    )

    for nb_id in notebook_ids:
        try:
            from app.workers.tasks import rebuild_knowledge_graph_task
            rebuild_knowledge_graph_task.delay(str(nb_id), user_id=user_id)
        except Exception:
            from app.agents.kg.knowledge_graph import rebuild_notebook_graph
            await rebuild_notebook_graph(str(nb_id), db)
            await db.commit()
    return success(RebuildStatusOut(status="started"))


@router.get(
    "/knowledge-graph/rebuild-progress",
    response_model=ApiResponse[RebuildProgressOut],
)
async def get_rebuild_progress(
    _current_user: CurrentUser,
):
    """Get the current rebuild progress for this user."""
    import json as _json
    import redis
    from app.config import settings

    r = redis.from_url(settings.redis_url, decode_responses=True)
    raw = r.get(f"kg:rebuild_progress:{_current_user.id}")
    if not raw:
        return success(RebuildProgressOut(status="idle"))
    try:
        data = _json.loads(raw)
        return success(RebuildProgressOut(**data))
    except Exception:
        return success(RebuildProgressOut(status="idle"))


@router.get(
    "/knowledge-graph/entities/{entity_id}",
    response_model=ApiResponse[EntityDetailOut],
)
async def get_entity_detail(
    entity_id: UUID,
    _current_user: CurrentUser,
    db: DbDep,
):
    """Get detailed info for a single knowledge entity."""
    result = await db.execute(
        select(KnowledgeEntity).where(KnowledgeEntity.id == entity_id)
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise NotFoundError("实体不存在")

    source_title = None
    if entity.source_id:
        src_result = await db.execute(
            select(Source.title).where(Source.id == entity.source_id)
        )
        source_title = src_result.scalar_one_or_none()

    out_rels = await db.execute(
        select(KnowledgeRelation, KnowledgeEntity.name).join(
            KnowledgeEntity, KnowledgeRelation.target_entity_id == KnowledgeEntity.id
        ).where(KnowledgeRelation.source_entity_id == entity.id)
    )
    in_rels = await db.execute(
        select(KnowledgeRelation, KnowledgeEntity.name).join(
            KnowledgeEntity, KnowledgeRelation.source_entity_id == KnowledgeEntity.id
        ).where(KnowledgeRelation.target_entity_id == entity.id)
    )

    relations = []
    for rel, target_name in out_rels.all():
        relations.append({
            "direction": "outgoing",
            "relation_type": rel.relation_type,
            "entity_name": target_name,
            "entity_id": str(rel.target_entity_id),
            "description": rel.description,
        })
    for rel, source_name in in_rels.all():
        relations.append({
            "direction": "incoming",
            "relation_type": rel.relation_type,
            "entity_name": source_name,
            "entity_id": str(rel.source_entity_id),
            "description": rel.description,
        })

    return success(EntityDetailOut(
        id=str(entity.id),
        name=entity.name,
        type=entity.entity_type,
        description=entity.description,
        mention_count=entity.mention_count,
        source_title=source_title,
        relations=relations,
    ))


@router.delete(
    "/knowledge-graph/entities/{entity_id}",
    status_code=204,
)
async def delete_entity(
    entity_id: UUID,
    _current_user: CurrentUser,
    db: DbDep,
):
    """Delete a knowledge entity and its relations."""
    await db.execute(
        delete(KnowledgeRelation).where(
            (KnowledgeRelation.source_entity_id == entity_id) |
            (KnowledgeRelation.target_entity_id == entity_id)
        )
    )
    await db.execute(
        delete(KnowledgeEntity).where(KnowledgeEntity.id == entity_id)
    )
    await db.commit()
