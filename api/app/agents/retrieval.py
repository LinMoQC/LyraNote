"""Backward-compatibility shim for legacy import path `app.agents.retrieval`."""

from app.agents.rag.retrieval import *  # noqa: F401,F403

from app.agents.rag.retrieval import _vector_search  # noqa: F401
from app.agents.rag.retrieval import _fts_search  # noqa: F401
from app.agents.rag.retrieval import _merge_hybrid  # noqa: F401
from app.agents.rag.retrieval import _rewrite_query  # noqa: F401
