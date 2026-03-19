"""Backward-compatibility shim for legacy import path `app.agents.deep_research`."""

from app.agents.research.deep_research import *  # noqa: F401,F403

from app.agents.research.deep_research import _extract_finding  # noqa: F401
from app.agents.research.deep_research import LEARNING_MAX_CHARS  # noqa: F401
