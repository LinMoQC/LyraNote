from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any


def create_logged_task(
    coro: Coroutine[Any, Any, Any],
    *,
    logger: logging.Logger,
    description: str,
) -> asyncio.Task[Any]:
    task = asyncio.create_task(coro, name=description)

    def _on_done(done_task: asyncio.Task[Any]) -> None:
        if done_task.cancelled():
            logger.debug("%s cancelled", description)
            return
        exc = done_task.exception()
        if exc is not None:
            logger.debug("%s failed: %s", description, exc)

    task.add_done_callback(_on_done)
    return task
