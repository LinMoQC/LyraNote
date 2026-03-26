import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._base import uuid_pk, now_col


class Notebook(Base):
    __tablename__ = "notebooks"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="active")  # active | archived
    is_global: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    system_type: Mapped[str | None] = mapped_column(String(50))  # e.g. "memory_diary"
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cover_emoji: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cover_gradient: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="notebooks")
    sources: Mapped[list["Source"]] = relationship(back_populates="notebook", passive_deletes=True)
    notes: Mapped[list["Note"]] = relationship(back_populates="notebook", passive_deletes=True)
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="notebook", passive_deletes=True)
    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="notebook", passive_deletes=True)
    chunks: Mapped[list["Chunk"]] = relationship(back_populates="notebook", passive_deletes=True)
    summary: Mapped["NotebookSummary | None"] = relationship(back_populates="notebook", passive_deletes=True, uselist=False)


class NotebookSummary(Base):
    __tablename__ = "notebook_summaries"

    notebook_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("notebooks.id", ondelete="CASCADE"), primary_key=True
    )
    summary_md: Mapped[str | None] = mapped_column(Text)
    key_themes: Mapped[list | None] = mapped_column(JSONB)  # ["主题A", "主题B"]
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    notebook: Mapped["Notebook"] = relationship(back_populates="summary")
