import uuid
from datetime import datetime

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._base import uuid_pk, now_col


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    username: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    github_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    # Comma-separated list of providers user has unbound; login will not re-attach by email (e.g. "github" or "google,github")
    oauth_unbound: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = now_col()

    notebooks: Mapped[list["Notebook"]] = relationship(back_populates="user")
    memories: Mapped[list["UserMemory"]] = relationship(back_populates="user", passive_deletes=True)
    reflections: Mapped[list["AgentReflection"]] = relationship(back_populates="user", passive_deletes=True)
    evaluations: Mapped[list["AgentEvaluation"]] = relationship(back_populates="user", passive_deletes=True)
    message_feedbacks: Mapped[list["MessageFeedback"]] = relationship(back_populates="user", passive_deletes=True)
    scheduled_tasks: Mapped[list["ScheduledTask"]] = relationship(back_populates="user", passive_deletes=True)
    agent_thoughts: Mapped[list["AgentThought"]] = relationship(back_populates="user", passive_deletes=True)
    portrait: Mapped["UserPortrait | None"] = relationship(back_populates="user", uselist=False, passive_deletes=True)


class AppConfig(Base):
    """Runtime key-value configuration written by the setup wizard."""
    __tablename__ = "app_config"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)
