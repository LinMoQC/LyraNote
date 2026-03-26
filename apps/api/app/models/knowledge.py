import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._base import uuid_pk, now_col


class KnowledgeEntity(Base):
    __tablename__ = "knowledge_entities"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # concept | person | technology | event | organization | other
    description: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sources.id", ondelete="SET NULL"), nullable=True
    )
    mention_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    notebook: Mapped["Notebook"] = relationship()
    source: Mapped["Source | None"] = relationship()
    outgoing_relations: Mapped[list["KnowledgeRelation"]] = relationship(
        foreign_keys="KnowledgeRelation.source_entity_id", back_populates="source_entity", passive_deletes=True
    )
    incoming_relations: Mapped[list["KnowledgeRelation"]] = relationship(
        foreign_keys="KnowledgeRelation.target_entity_id", back_populates="target_entity", passive_deletes=True
    )


class KnowledgeRelation(Base):
    __tablename__ = "knowledge_relations"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    source_entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge_entities.id", ondelete="CASCADE")
    )
    target_entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge_entities.id", ondelete="CASCADE")
    )
    relation_type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sources.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = now_col()

    notebook: Mapped["Notebook"] = relationship()
    source_entity: Mapped["KnowledgeEntity"] = relationship(
        foreign_keys=[source_entity_id], back_populates="outgoing_relations"
    )
    target_entity: Mapped["KnowledgeEntity"] = relationship(
        foreign_keys=[target_entity_id], back_populates="incoming_relations"
    )
    source: Mapped["Source | None"] = relationship()


class ProactiveInsight(Base):
    __tablename__ = "proactive_insights"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    notebook_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=True
    )
    # source_indexed | task_completed | knowledge_update
    insight_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = now_col()
