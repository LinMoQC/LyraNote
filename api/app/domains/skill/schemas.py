"""
Skill domain Pydantic schemas.
"""

from pydantic import BaseModel


class SkillOut(BaseModel):
    name: str
    display_name: str | None
    description: str | None
    category: str | None
    version: str
    is_builtin: bool
    is_enabled: bool
    always: bool
    requires_env: list[str] | None
    env_satisfied: bool
    config_schema: dict | None
    config: dict | None
    # User-level override (None means no override set)
    user_override: dict | None


class SkillUpdateIn(BaseModel):
    is_enabled: bool | None = None
    config: dict | None = None


class UserSkillConfigOut(BaseModel):
    skill_name: str
    is_enabled: bool | None
    config: dict | None
