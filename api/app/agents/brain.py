"""Backward-compatibility shim for legacy import path `app.agents.brain`."""

from app.agents.core.brain import *  # noqa: F401,F403

from app.agents.core.brain import _is_knowledge_query  # noqa: F401
