from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.workers.tasks.ingestion import _expire_stuck_sources_impl, _mark_source_failed


class _ScalarList:
    def __init__(self, values):
        self._values = values

    def all(self):
        return self._values


class _ExecuteResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _ScalarList(self._values)


def test_mark_source_failed_sets_status_without_metadata_field() -> None:
    source = SimpleNamespace(status="processing", summary=None)

    _mark_source_failed(source, "indexing_timeout")

    assert source.status == "failed"
    assert "索引超时" in source.summary


def test_mark_source_failed_sets_missing_storage_message() -> None:
    source = SimpleNamespace(status="processing", summary=None)

    _mark_source_failed(source, "storage_missing")

    assert source.status == "failed"
    assert "原始文件不存在" in source.summary


@pytest.mark.asyncio
async def test_expire_stuck_sources_marks_pending_and_processing_failed() -> None:
    old_time = datetime.now(UTC) - timedelta(minutes=30)
    source_a = SimpleNamespace(status="pending", summary=None, updated_at=old_time)
    source_b = SimpleNamespace(status="processing", summary="existing", updated_at=old_time)

    db = SimpleNamespace(
        execute=AsyncMock(return_value=_ExecuteResult([source_a, source_b])),
        commit=AsyncMock(return_value=None),
    )

    count = await _expire_stuck_sources_impl(db)

    assert count == 2
    assert source_a.status == "failed"
    assert "索引超时" in source_a.summary
    assert source_b.status == "failed"
    assert source_b.summary == "existing"
    db.commit.assert_awaited_once()
