"""
Skills system base interfaces.

Each Skill is a self-contained unit with:
  - SkillMeta: static metadata (name, category, requirements)
  - SkillBase: abstract class with get_schema() + execute()

Two kinds of skills:
  - Python skills (SkillBase subclass): callable LLM tools with execute()
  - Markdown skills (MarkdownSkill): knowledge/workflow guides from SKILL.md files,
    injected into the system prompt as reference docs (not callable as tools)

Compatible with OpenClaw/AgentSkills SKILL.md frontmatter format.
"""

from __future__ import annotations

import os
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.agents.core.tools import ToolContext


@dataclass
class SkillMeta:
    """
    Static metadata for a Skill unit.
    Maps to OpenClaw SKILL.md frontmatter fields.
    """
    name: str
    display_name: str
    description: str
    category: str                                        # knowledge | web | writing | memory | productivity
    when_to_use: str | None = None                       # short trigger guidance for prompt-time matching
    version: str = "1.0.0"
    requires_env: list[str] = field(default_factory=list)  # env vars that must be set for this skill to load
    always: bool = False                                 # if True, skip is_enabled DB filter (core skills)
    config_schema: dict | None = None                    # JSON Schema for user-configurable parameters
    thought_label: str = "⚙️ 处理中"                     # shown in SSE "thought" events

    # ── Execution characteristics (inspired by Claude Code's Tool interface) ──

    # True → safe to run concurrently with other concurrency_safe tools.
    # Read-only tools (search, fetch, compare) set this True.
    # Write/side-effect tools (create_note, update_memory) must leave it False.
    # Replaces the static _READ_ONLY_TOOLS frozenset in tools.py.
    concurrency_safe: bool = False

    # Maximum chars to keep in the message-history copy of a tool result
    # (microCompact layer).  Full result is still stored in state.tool_results
    # for _build_context.  Set to 0 to disable truncation for this tool.
    max_result_chars: int = 3000

    # "cancel" → abort on user interrupt (Ctrl-C / new message while running)
    # "block"  → run to completion, queue the interruption for after
    # Write/side-effect tools should use "block" to avoid partial state.
    interrupt_behavior: str = "cancel"  # "cancel" | "block"


class SkillBase(ABC):
    """
    Abstract base class for all Skills.

    Subclasses must:
    1. Define a class-level `meta: SkillMeta`
    2. Implement `get_schema()` returning an OpenAI function-calling dict
    3. Implement `execute(args, ctx)` with the actual tool logic
    """

    meta: SkillMeta

    def get_schema(self, config: dict | None = None) -> dict:
        """
        Return an OpenAI function-calling compatible schema dict.
        Subclasses may override to inject config-driven enum values.
        The default implementation calls _build_schema() which must be overridden.
        """
        return self._build_schema(config or {})

    def _build_schema(self, config: dict) -> dict:
        raise NotImplementedError(f"{self.__class__.__name__} must implement _build_schema()")

    @abstractmethod
    async def execute(self, args: dict, ctx: "ToolContext") -> str:
        """Execute the skill and return a string result for the LLM to continue reasoning."""
        ...

    def is_concurrency_safe(self) -> bool:
        """Return True if this tool is safe to run concurrently with other concurrency-safe tools.

        Read-only tools (search, fetch) return True.
        Tools with side effects (write, create, update) must return False.
        Default delegates to meta.concurrency_safe; subclasses may override for
        input-dependent safety (e.g. a tool that is read-only only for certain args).
        """
        return self.meta.concurrency_safe

    def passes_gating(self) -> bool:
        """
        Check whether all required environment variables are present.
        Checks os.environ first, then falls back to the pydantic Settings object
        (pydantic_settings reads .env but does NOT populate os.environ).
        Skills that fail gating are excluded from the active skills list at runtime.
        """
        if not self.meta.requires_env:
            return True
        from app.config import settings
        for env in self.meta.requires_env:
            # os.environ takes priority (explicit shell export), then pydantic settings
            val = os.environ.get(env) or getattr(settings, env.lower(), None)
            if not val:
                return False
        return True

    @property
    def is_markdown_skill(self) -> bool:
        """True if this skill is knowledge-only (no tool schema, injected via prompt)."""
        return False


# ---------------------------------------------------------------------------
# MarkdownSkill — AgentSkills SKILL.md format
# ---------------------------------------------------------------------------

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)", re.DOTALL)


class MarkdownSkill(SkillBase):
    """
    A knowledge/workflow skill loaded from a SKILL.md file.

    These skills are NOT callable LLM tools. Instead their Markdown body is
    injected into the system prompt so the AI follows the workflow guidance.

    SKILL.md format (YAML frontmatter + Markdown body):
    ---
    name: skill-name
    description: One-line description shown in skill list
    category: knowledge | web | writing | memory | productivity
    version: 1.0.0         # optional
    requires_env: []       # optional env vars required
    always: false          # optional: always inject regardless of DB flag
    ---
    # Skill Title
    Full Markdown guidance body...
    """

    def __init__(self, path: Path) -> None:
        self._path = path
        self._body = ""
        self._load(path)

    def _load(self, path: Path) -> None:
        """Parse YAML frontmatter and Markdown body from SKILL.md."""
        import yaml

        text = path.read_text(encoding="utf-8")
        match = _FRONTMATTER_RE.match(text)
        if not match:
            raise ValueError(f"SKILL.md at {path} has no valid YAML frontmatter")

        frontmatter_raw, body = match.group(1), match.group(2).strip()
        fm: dict = yaml.safe_load(frontmatter_raw) or {}

        name = fm.get("name") or path.parent.name
        self.meta = SkillMeta(
            name=name,
            display_name=fm.get("display_name") or name.replace("-", " ").title(),
            description=fm.get("description") or "",
            category=fm.get("category") or "knowledge",
            when_to_use=fm.get("when_to_use") or fm.get("whenToUse"),
            version=str(fm.get("version") or "1.0.0"),
            requires_env=list(fm.get("requires_env") or []),
            always=bool(fm.get("always", False)),
            thought_label=fm.get("thought_label") or "⚙️ 处理中",
        )
        self._body = body

    @property
    def body(self) -> str:
        """The Markdown guidance body to inject into the system prompt."""
        return self._body

    @property
    def is_markdown_skill(self) -> bool:
        return True

    def _build_schema(self, config: dict) -> dict:
        raise NotImplementedError("MarkdownSkill is not a callable tool and has no schema")

    async def execute(self, args: dict, ctx: "ToolContext") -> str:
        raise NotImplementedError("MarkdownSkill is not a callable tool")

    @classmethod
    def from_file(cls, path: Path) -> "MarkdownSkill":
        """Load a MarkdownSkill from a SKILL.md file path."""
        return cls(path)
