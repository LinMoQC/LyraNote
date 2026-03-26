import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._base import uuid_pk, now_col


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = uuid_pk()
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(String(500))
    content_json: Mapped[dict | None] = mapped_column(JSONB)   # Tiptap JSON
    content_text: Mapped[str | None] = mapped_column(Text)     # plain text for embedding
    word_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # MD5 of content_text at last indexing; skip re-index if unchanged
    last_indexed_hash: Mapped[str | None] = mapped_column(String(32), nullable=True)

    notebook: Mapped["Notebook"] = relationship(back_populates="notes")
