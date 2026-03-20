"""Pydantic schemas for the knowledge graph domain."""

from pydantic import BaseModel


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
