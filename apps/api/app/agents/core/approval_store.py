"""
In-memory Human-in-the-Loop approval store.

Each pending MCP tool call creates an asyncio.Event keyed by a UUID.
The engine awaits that event; a separate API endpoint resolves it.

Limitations:
  - Single-process only (no Redis/DB backing needed for this project scope).
  - Events are cleaned up by the engine after resolution or timeout.
"""

from __future__ import annotations

import asyncio

_events: dict[str, asyncio.Event] = {}
_results: dict[str, bool] = {}


def create(approval_id: str) -> asyncio.Event:
    """Register a new pending approval and return the event to await."""
    event = asyncio.Event()
    _events[approval_id] = event
    _results[approval_id] = False
    return event


def resolve(approval_id: str, approved: bool) -> bool:
    """Set the result and unblock the waiting engine.  Returns False if not found."""
    if approval_id not in _events:
        return False
    _results[approval_id] = approved
    _events[approval_id].set()
    return True


def get_result(approval_id: str) -> bool:
    return _results.get(approval_id, False)


def cleanup(approval_id: str) -> None:
    _events.pop(approval_id, None)
    _results.pop(approval_id, None)
