from __future__ import annotations

import asyncio
import logging

import pytest

from app.utils.async_tasks import create_logged_task


@pytest.mark.asyncio
async def test_create_logged_task_logs_exceptions(caplog) -> None:
    async def _boom() -> None:
        raise RuntimeError("boom")

    logger = logging.getLogger("tests.async_tasks")

    with caplog.at_level(logging.DEBUG):
        task = create_logged_task(_boom(), logger=logger, description="background task")
        with pytest.raises(RuntimeError, match="boom"):
            await task

    assert "background task failed: boom" in caplog.text


@pytest.mark.asyncio
async def test_create_logged_task_logs_cancellation(caplog) -> None:
    logger = logging.getLogger("tests.async_tasks")

    with caplog.at_level(logging.DEBUG):
        task = create_logged_task(
            asyncio.sleep(10),
            logger=logger,
            description="sleep task",
        )
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    assert "sleep task cancelled" in caplog.text
