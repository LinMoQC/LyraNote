import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.config import settings
from app.models._base import uuid_pk, now_col
from app.models._json import json_type


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(String(500))
    type: Mapped[str] = mapped_column(String(50))   # pdf | web | md | note
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending | processing | indexed | failed
    file_path: Mapped[str | None] = mapped_column(Text)     # legacy: absolute local path (kept for backward compat)
    url: Mapped[str | None] = mapped_column(Text)
    raw_text: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    # Storage abstraction fields (new uploads use these instead of file_path)
    storage_key: Mapped[str | None] = mapped_column(String(500))      # e.g. "notebooks/<nb_id>/<uuid>.pdf"
    storage_backend: Mapped[str | None] = mapped_column(String(20))   # "local" | "s3" | "minio" | "oss" | "r2"
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    notebook: Mapped["Notebook"] = relationship(back_populates="sources")
    chunks: Mapped[list["Chunk"]] = relationship(back_populates="source", passive_deletes=True)


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[uuid.UUID] = uuid_pk()
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sources.id", ondelete="CASCADE"), nullable=True
    )
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.embedding_dimensions))
    token_count: Mapped[int | None] = mapped_column(Integer)
    metadata_: Mapped[dict | None] = mapped_column("metadata", json_type)
    created_at: Mapped[datetime] = now_col()
    # "source" (default, from imported sources) | "note" (from user notes)
    source_type: Mapped[str] = mapped_column(String(20), default="source", nullable=False)
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), nullable=True
    )

    source: Mapped["Source | None"] = relationship(back_populates="chunks")
    notebook: Mapped["Notebook"] = relationship(back_populates="chunks")
