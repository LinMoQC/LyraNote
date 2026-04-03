import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._base import uuid_pk, now_col
from app.models._json import json_type


class SkillInstall(Base):
    """
    Global registry of installed skills.
    Bundled skills are seeded here on first startup; external skills are
    inserted when installed via the skill management API.
    """
    __tablename__ = "skill_installs"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    # knowledge | web | writing | memory | productivity
    category: Mapped[str | None] = mapped_column(String(50))
    version: Mapped[str] = mapped_column(String(20), default="1.0.0", nullable=False)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # If True, this skill is always loaded regardless of is_enabled
    always: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # JSON list of required env var names, e.g. ["TAVILY_API_KEY"]
    requires_env: Mapped[list | None] = mapped_column(json_type)
    # JSON Schema for configurable parameters
    config_schema: Mapped[dict | None] = mapped_column(json_type)
    # Current config values (merged with user-level overrides at runtime)
    config: Mapped[dict | None] = mapped_column(json_type)
    installed_at: Mapped[datetime] = now_col()


class UserSkillConfig(Base):
    """
    Per-user skill enable/disable and configuration overrides.
    A row here takes priority over skill_installs values for that user.
    """
    __tablename__ = "user_skill_configs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    skill_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    # None means "inherit from global" — only set when user has explicitly changed it
    is_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # User-level config overrides (merged on top of global config at runtime)
    config: Mapped[dict | None] = mapped_column(json_type)
