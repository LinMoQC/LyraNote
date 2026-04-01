"""
SkillRegistry — manages loading, filtering and dispatching of Skills.

Three-tier loading priority (highest → lowest):
  1. workspace skills    ./skills/*.py
  2. user-managed skills ~/.lyranote/skills/*.py
  3. bundled skills      app/skills/builtin/

Same-named skills from a higher tier override lower-tier ones.

At request time, get_active_skills() applies two filters:
  - Gating: requires_env check (env vars must be present)
  - DB gate: skill_installs.is_enabled + user_skill_configs override
"""

from __future__ import annotations

import importlib.util
import logging
import os
from pathlib import Path
from uuid import UUID
from xml.sax.saxutils import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.skills.base import MarkdownSkill, SkillBase

logger = logging.getLogger(__name__)


class SkillRegistry:
    """Singleton skill manager."""

    def __init__(self) -> None:
        # Ordered insertion: first registered = lowest priority
        # Higher-priority tiers call register(..., override=True)
        self._skills: dict[str, SkillBase] = {}
        self._fn_name_index: dict[str, SkillBase] = {}

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, skill: SkillBase, override: bool = False) -> None:
        """Register a single skill instance."""
        name = skill.meta.name
        if name in self._skills and not override:
            logger.debug("Skill '%s' already registered; skipping (use override=True to replace)", name)
            return
        self._skills[name] = skill
        try:
            fn_name = skill.get_schema({}).get("name", "")
            if fn_name:
                self._fn_name_index[fn_name] = skill
        except Exception:
            pass
        logger.debug("Registered skill: %s (override=%s)", name, override)

    def register_from_dir(self, directory: str, override: bool = True) -> int:
        """
        Dynamically load Skill instances from Python files in `directory`.

        Each file must expose a module-level `skill = MySkillClass()` variable.
        Returns the count of successfully loaded skills.
        """
        path = Path(directory)
        if not path.is_dir():
            return 0

        loaded = 0
        for py_file in sorted(path.glob("*.py")):
            if py_file.name.startswith("_"):
                continue
            try:
                spec = importlib.util.spec_from_file_location(py_file.stem, py_file)
                if spec is None or spec.loader is None:
                    continue
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                skill_instance = getattr(module, "skill", None)
                if isinstance(skill_instance, SkillBase):
                    self.register(skill_instance, override=override)
                    loaded += 1
                else:
                    logger.warning("File %s has no `skill` instance of SkillBase, skipped", py_file)
            except Exception:
                logger.exception("Failed to load skill from %s", py_file)

        return loaded

    def register_md_skills_from_dir(self, directory: str, override: bool = True) -> int:
        """
        Recursively scan `directory` for SKILL.md files and register them as MarkdownSkills.

        Supports two layouts:
          - <directory>/<skill-name>/SKILL.md   (OpenClaw-style, one dir per skill)
          - <directory>/SKILL.md                (flat single skill)

        Returns the count of successfully loaded skills.
        """
        path = Path(directory)
        if not path.is_dir():
            return 0

        loaded = 0
        # Collect all SKILL.md files (both flat and nested)
        md_files = list(path.glob("SKILL.md")) + list(path.glob("*/SKILL.md"))
        for md_file in sorted(md_files):
            try:
                skill_instance = MarkdownSkill.from_file(md_file)
                self.register(skill_instance, override=override)
                loaded += 1
                logger.debug("Loaded SKILL.md: %s (%s)", skill_instance.meta.name, md_file)
            except Exception:
                logger.exception("Failed to load SKILL.md from %s", md_file)

        return loaded

    def all_md_skills(self) -> list[MarkdownSkill]:
        """Return all registered MarkdownSkill instances."""
        return [s for s in self._skills.values() if isinstance(s, MarkdownSkill)]

    def all_tool_skills(self) -> list[SkillBase]:
        """Return all registered Python (callable) skills (excludes MarkdownSkills)."""
        return [s for s in self._skills.values() if not isinstance(s, MarkdownSkill)]

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def all_skills(self) -> list[SkillBase]:
        return list(self._skills.values())

    def resolve(self, skill_name: str) -> SkillBase | None:
        """Resolve a skill by metadata name or function schema name."""
        return (
            self._skills.get(skill_name)
            or self._skills.get(skill_name.replace("_", "-"))
            or self._fn_name_index.get(skill_name)
        )

    def get_markdown_skill(self, skill_name: str) -> MarkdownSkill | None:
        """Return a MarkdownSkill by name if it exists."""
        skill = self.resolve(skill_name)
        return skill if isinstance(skill, MarkdownSkill) else None

    async def get_active_skills(
        self,
        user_id: UUID,
        db: AsyncSession,
    ) -> list[SkillBase]:
        """
        Return skills that pass both Gating and DB enable filters.

        Priority order:
          1. skills with meta.always=True are always included (skip DB filter)
          2. Gating: requires_env must all be set
          3. DB skill_installs.is_enabled=True (default True if row missing)
          4. user_skill_configs can override is_enabled per user
        """
        from app.models import SkillInstall, UserSkillConfig

        # Load DB state in one query each
        try:
            install_rows = (
                await db.execute(select(SkillInstall))
            ).scalars().all()
            install_map: dict[str, SkillInstall] = {r.name: r for r in install_rows}

            user_cfg_rows = (
                await db.execute(
                    select(UserSkillConfig).where(UserSkillConfig.user_id == user_id)
                )
            ).scalars().all()
            user_cfg_map: dict[str, UserSkillConfig] = {r.skill_name: r for r in user_cfg_rows}
        except Exception:
            logger.warning("Failed to load skill DB state, falling back to gating-only mode", exc_info=True)
            install_map = {}
            user_cfg_map = {}

        active: list[SkillBase] = []
        for skill in self._skills.values():
            name = skill.meta.name

            # Gating check
            if not skill.passes_gating():
                logger.debug("Skill '%s' blocked by gating (missing env vars: %s)", name, skill.meta.requires_env)
                continue

            # Always-on skills skip DB filter
            if skill.meta.always:
                active.append(skill)
                continue

            # Check global enable state (default: enabled if no DB row)
            install = install_map.get(name)
            globally_enabled = install.is_enabled if install else True

            # Check user override
            user_cfg = user_cfg_map.get(name)
            if user_cfg is not None and user_cfg.is_enabled is not None:
                is_enabled = user_cfg.is_enabled
            else:
                is_enabled = globally_enabled

            if is_enabled:
                active.append(skill)

        return active

    async def get_skill_config(
        self,
        skill_name: str,
        user_id: UUID,
        db: AsyncSession,
    ) -> dict:
        """
        Merge global config with user-level override for a specific skill.
        Returns empty dict if no config exists.
        """
        from app.models import SkillInstall, UserSkillConfig

        try:
            install = (
                await db.execute(select(SkillInstall).where(SkillInstall.name == skill_name))
            ).scalar_one_or_none()
            user_cfg = (
                await db.execute(
                    select(UserSkillConfig).where(
                        UserSkillConfig.user_id == user_id,
                        UserSkillConfig.skill_name == skill_name,
                    )
                )
            ).scalar_one_or_none()
        except Exception:
            logger.warning("Failed to load config for skill '%s'", skill_name, exc_info=True)
            return {}

        config: dict = {}
        if install and install.config:
            config.update(install.config)
        if user_cfg and user_cfg.config:
            config.update(user_cfg.config)
        return config

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    async def execute(
        self,
        skill_name: str,
        args: dict,
        ctx: "ToolContext",
    ) -> str:
        """Dispatch to the named skill's execute() method."""
        skill = self.resolve(skill_name)
        if skill is None:
            return f"未知工具：{skill_name}"
        try:
            return await skill.execute(args, ctx)
        except Exception as exc:
            logger.exception("Skill '%s' raised an error", skill_name)
            return f"工具 {skill_name} 执行失败：{exc}"

    # ------------------------------------------------------------------
    # Prompt helpers
    # ------------------------------------------------------------------

    def format_skills_for_prompt(self, skills: list[SkillBase]) -> str:
        """
        Serialize active tool (Python) skills into an XML block for system prompt injection.
        Excludes MarkdownSkills, which are represented separately as guide manifests.
        """
        tool_skills = [s for s in skills if not s.is_markdown_skill]
        if not tool_skills:
            return ""

        lines = ["<skills>"]
        for skill in tool_skills:
            m = skill.meta
            when_to_use = m.when_to_use or m.description
            lines.append(f'  <skill name="{escape(m.name)}" category="{escape(m.category)}">')
            lines.append(f"    <description>{escape(m.description)}</description>")
            if when_to_use:
                lines.append(f"    <when_to_use>{escape(when_to_use)}</when_to_use>")
            lines.append("  </skill>")
        lines.append("</skills>")
        return "\n".join(lines)

    def format_guide_skills_for_prompt(self, skills: list[SkillBase]) -> str:
        """
        Serialize active Markdown skills into a lightweight manifest.
        The guide bodies themselves are loaded on demand via read_skill_guide.
        """
        md_skills = [s for s in skills if isinstance(s, MarkdownSkill)]
        if not md_skills:
            return ""

        parts = ["<skill-guides>"]
        for skill in md_skills:
            meta = skill.meta
            when_to_use = meta.when_to_use or meta.description
            parts.append(
                f'  <guide name="{escape(meta.name)}" category="{escape(meta.category)}">'
            )
            parts.append(f"    <description>{escape(meta.description)}</description>")
            if when_to_use:
                parts.append(f"    <when_to_use>{escape(when_to_use)}</when_to_use>")
            parts.append("  </guide>")
        parts.append("</skill-guides>")
        return "\n".join(parts)

    def get_thought_labels(self) -> dict[str, str]:
        """Return {skill_name: thought_label} for all registered skills."""
        return {s.meta.name: s.meta.thought_label for s in self._skills.values()}


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

skill_registry = SkillRegistry()


def bootstrap_builtin_skills() -> None:
    """
    Register all bundled skills.
    Called once at application startup from app/main.py.
    Priority order: bundled first, then user-managed, then workspace (each overrides previous).

    Skill types loaded:
      1. Built-in Python skills (app/skills/builtin/*.py)
      2. Built-in SKILL.md knowledge skills (./skills/ in project root)
      3. User-managed Python/SKILL.md skills (~/.lyranote/skills/)
      4. Workspace-local overrides (./skills/ relative to cwd)
    """
    from app.skills.builtin import register_all
    register_all(skill_registry)

    # Built-in SKILL.md knowledge packs: app/skills/packs/ (sibling of this file)
    # __file__ = api/app/skills/registry.py  →  packs/  =  api/app/skills/packs/
    project_skills_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), "packs"))
    count = skill_registry.register_md_skills_from_dir(project_skills_dir, override=False)
    if count:
        logger.info("Loaded %d built-in SKILL.md skills from %s", count, project_skills_dir)

    # User-managed skills (~/.lyranote/skills/) — supports both .py and SKILL.md
    user_skills_dir = os.path.expanduser("~/.lyranote/skills")
    count = skill_registry.register_from_dir(user_skills_dir, override=True)
    count += skill_registry.register_md_skills_from_dir(user_skills_dir, override=True)
    if count:
        logger.info("Loaded %d user-managed skills from %s", count, user_skills_dir)

    # Workspace skills (./skills/ relative to cwd) — supports both .py and SKILL.md
    workspace_skills_dir = os.path.join(os.getcwd(), "skills")
    count = skill_registry.register_from_dir(workspace_skills_dir, override=True)
    count += skill_registry.register_md_skills_from_dir(workspace_skills_dir, override=True)
    if count:
        logger.info("Loaded %d workspace skills from %s", count, workspace_skills_dir)
