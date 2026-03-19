"""
Skill Management API — lets users view and configure their agent skills.

Endpoints:
  GET    /skills                  List all registered skills with global + user state
  GET    /skills/{name}           Detailed info for one skill (including config_schema)
  PUT    /skills/{name}           Global enable/disable or config update (admin-like)
  GET    /skills/user/config      Current user's skill overrides
  PUT    /skills/user/{name}      User-level enable/disable or config override
  DELETE /skills/user/{name}      Reset user override (revert to global state)
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.domains.skill.schemas import SkillOut, SkillUpdateIn, UserSkillConfigOut
from app.exceptions import BadRequestError, NotFoundError
from app.models import SkillInstall, UserSkillConfig
from app.schemas.response import ApiResponse, success
from app.skills.registry import skill_registry

router = APIRouter(tags=["skills"])


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _check_env(requires_env: list | None) -> bool:
    import os
    if not requires_env:
        return True
    return all(bool(os.environ.get(e)) for e in requires_env)


def _build_skill_out(
    install: SkillInstall,
    user_cfg: UserSkillConfig | None,
) -> SkillOut:
    user_override: dict | None = None
    if user_cfg is not None:
        user_override = {}
        if user_cfg.is_enabled is not None:
            user_override["is_enabled"] = user_cfg.is_enabled
        if user_cfg.config is not None:
            user_override["config"] = user_cfg.config
        if not user_override:
            user_override = None

    return SkillOut(
        name=install.name,
        display_name=install.display_name,
        description=install.description,
        category=install.category,
        version=install.version,
        is_builtin=install.is_builtin,
        is_enabled=install.is_enabled,
        always=install.always,
        requires_env=install.requires_env,
        env_satisfied=_check_env(install.requires_env),
        config_schema=install.config_schema,
        config=install.config,
        user_override=user_override,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/skills", response_model=ApiResponse[list[SkillOut]])
async def list_skills(current_user: CurrentUser, db: DbDep):
    """
    Return all registered skills with their current global state and the
    current user's override (if any).
    """
    installs = (await db.execute(select(SkillInstall).order_by(SkillInstall.name))).scalars().all()
    user_cfgs = (
        await db.execute(
            select(UserSkillConfig).where(UserSkillConfig.user_id == current_user.id)
        )
    ).scalars().all()
    user_cfg_map: dict[str, UserSkillConfig] = {c.skill_name: c for c in user_cfgs}

    db_names = {inst.name for inst in installs}
    result: list[SkillOut] = [_build_skill_out(inst, user_cfg_map.get(inst.name)) for inst in installs]

    for skill in skill_registry.all_skills():
        if skill.meta.name not in db_names:
            m = skill.meta
            result.append(
                SkillOut(
                    name=m.name,
                    display_name=m.display_name,
                    description=m.description,
                    category=m.category,
                    version=m.version,
                    is_builtin=True,
                    is_enabled=True,
                    always=m.always,
                    requires_env=m.requires_env or None,
                    env_satisfied=skill.passes_gating(),
                    config_schema=m.config_schema,
                    config=None,
                    user_override=None,
                )
            )

    return success(result)


@router.get("/skills/user/config", response_model=ApiResponse[list[UserSkillConfigOut]])
async def get_user_skill_configs(current_user: CurrentUser, db: DbDep):
    """Return all user-level skill overrides for the current user."""
    cfgs = (
        await db.execute(
            select(UserSkillConfig).where(UserSkillConfig.user_id == current_user.id)
        )
    ).scalars().all()
    return success([UserSkillConfigOut(skill_name=c.skill_name, is_enabled=c.is_enabled, config=c.config) for c in cfgs])


@router.get("/skills/{name}", response_model=ApiResponse[SkillOut])
async def get_skill(name: str, current_user: CurrentUser, db: DbDep):
    """Get detail for one skill."""
    install = (
        await db.execute(select(SkillInstall).where(SkillInstall.name == name))
    ).scalar_one_or_none()

    if install is None:
        skill = next((s for s in skill_registry.all_skills() if s.meta.name == name), None)
        if skill is None:
            raise NotFoundError(f"技能 '{name}' 不存在")
        m = skill.meta
        return success(SkillOut(
            name=m.name,
            display_name=m.display_name,
            description=m.description,
            category=m.category,
            version=m.version,
            is_builtin=True,
            is_enabled=True,
            always=m.always,
            requires_env=m.requires_env or None,
            env_satisfied=skill.passes_gating(),
            config_schema=m.config_schema,
            config=None,
            user_override=None,
        ))

    user_cfg = (
        await db.execute(
            select(UserSkillConfig).where(
                UserSkillConfig.user_id == current_user.id,
                UserSkillConfig.skill_name == name,
            )
        )
    ).scalar_one_or_none()

    return success(_build_skill_out(install, user_cfg))


@router.put("/skills/{name}", response_model=ApiResponse[SkillOut])
async def update_skill_global(name: str, body: SkillUpdateIn, current_user: CurrentUser, db: DbDep):
    """Update global skill settings (enable/disable or config)."""
    install = (
        await db.execute(select(SkillInstall).where(SkillInstall.name == name))
    ).scalar_one_or_none()

    if install is None:
        raise NotFoundError(f"技能 '{name}' 不存在")

    if install.always and body.is_enabled is False:
        raise BadRequestError(f"技能 '{name}' 是核心技能（always=True），无法禁用")

    if body.is_enabled is not None:
        install.is_enabled = body.is_enabled
    if body.config is not None:
        install.config = body.config

    await db.flush()
    return success(_build_skill_out(install, None))


@router.put("/skills/user/{name}", response_model=ApiResponse[UserSkillConfigOut])
async def update_user_skill_config(name: str, body: SkillUpdateIn, current_user: CurrentUser, db: DbDep):
    """Set user-level enable/disable or config override for a skill."""
    skill_exists = (
        await db.execute(select(SkillInstall.name).where(SkillInstall.name == name))
    ).scalar_one_or_none()
    in_memory = any(s.meta.name == name for s in skill_registry.all_skills())

    if skill_exists is None and not in_memory:
        raise NotFoundError(f"技能 '{name}' 不存在")

    if body.is_enabled is False:
        install = (
            await db.execute(select(SkillInstall).where(SkillInstall.name == name))
        ).scalar_one_or_none()
        skill_obj = next((s for s in skill_registry.all_skills() if s.meta.name == name), None)
        is_always = (install and install.always) or (skill_obj and skill_obj.meta.always)
        if is_always:
            raise BadRequestError(f"技能 '{name}' 是核心技能，无法禁用")

    cfg = (
        await db.execute(
            select(UserSkillConfig).where(
                UserSkillConfig.user_id == current_user.id,
                UserSkillConfig.skill_name == name,
            )
        )
    ).scalar_one_or_none()

    if cfg is None:
        cfg = UserSkillConfig(user_id=current_user.id, skill_name=name)
        db.add(cfg)

    if body.is_enabled is not None:
        cfg.is_enabled = body.is_enabled
    if body.config is not None:
        cfg.config = body.config

    await db.flush()
    return success(UserSkillConfigOut(skill_name=cfg.skill_name, is_enabled=cfg.is_enabled, config=cfg.config))


@router.delete("/skills/user/{name}", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_skill_config(name: str, current_user: CurrentUser, db: DbDep):
    """Remove user-level override for a skill (reverts to global state)."""
    cfg = (
        await db.execute(
            select(UserSkillConfig).where(
                UserSkillConfig.user_id == current_user.id,
                UserSkillConfig.skill_name == name,
            )
        )
    ).scalar_one_or_none()

    if cfg is not None:
        await db.delete(cfg)
        await db.flush()
