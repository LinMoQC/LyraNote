"""
Register all bundled (built-in) skills.
Called once at startup by bootstrap_builtin_skills().
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.skills.registry import SkillRegistry


def register_all(registry: "SkillRegistry") -> None:
    """Import and register every built-in Skill instance."""
    from app.skills.builtin.search_knowledge import skill as search_knowledge
    from app.skills.builtin.web_search import skill as web_search
    from app.skills.builtin.summarize import skill as summarize
    from app.skills.builtin.create_note import skill as create_note
    from app.skills.builtin.mind_map import skill as mind_map
    from app.skills.builtin.update_preference import skill as update_preference
    from app.skills.builtin.update_memory_doc import skill as update_memory_doc
    from app.skills.builtin.deep_read import skill as deep_read
    from app.skills.builtin.compare_sources import skill as compare_sources
    from app.skills.builtin.scheduled_task import skill as scheduled_task
    from app.skills.builtin.diagram import skill as diagram

    for s in (search_knowledge, web_search, summarize, create_note, mind_map, update_preference, update_memory_doc, deep_read, compare_sources, scheduled_task, diagram):
        registry.register(s, override=False)
