from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.models import Source
from app.services.source_service import SourceService


class _ScalarResult:
    def __init__(self, values: list[str]) -> None:
        self._values = values

    def scalars(self) -> "_ScalarResult":
        return self

    def all(self) -> list[str]:
        return self._values


@pytest.mark.asyncio
async def test_import_web_sources_dedupes_existing_urls(monkeypatch) -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if isinstance(obj, Source) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())

    db = SimpleNamespace(
        add=Mock(side_effect=added.append),
        flush=AsyncMock(side_effect=flush),
        refresh=AsyncMock(return_value=None),
        execute=AsyncMock(return_value=_ScalarResult(["https://example.com/page?utm_source=test"])),
    )
    service = SourceService(db, uuid.uuid4())
    notebook_id = uuid.uuid4()
    monkeypatch.setattr(service, "_assert_notebook_owner", AsyncMock(return_value=None))

    delayed: list[str] = []
    monkeypatch.setattr("app.workers.tasks.ingest_source.delay", lambda source_id: delayed.append(source_id))

    result = await service.import_web_sources(
        [
            {"title": "Existing", "url": "https://example.com/page"},
            {"title": "New", "url": "https://example.com/new?utm_medium=cpc"},
            {"title": "DupInBatch", "url": "https://example.com/new"},
            {"title": "Missing", "url": ""},
        ],
        notebook_id=notebook_id,
    )

    assert result.notebook_id == notebook_id
    assert result.created_count == 1
    assert result.skipped_count == 3
    assert len(delayed) == 1

    created_source = next(obj for obj in added if isinstance(obj, Source))
    assert created_source.url == "https://example.com/new"


@pytest.mark.asyncio
async def test_import_web_sources_uses_global_notebook_when_target_missing(monkeypatch) -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if isinstance(obj, Source) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())

    db = SimpleNamespace(
        add=Mock(side_effect=added.append),
        flush=AsyncMock(side_effect=flush),
        refresh=AsyncMock(return_value=None),
        execute=AsyncMock(return_value=_ScalarResult([])),
    )
    service = SourceService(db, uuid.uuid4())
    global_notebook = SimpleNamespace(id=uuid.uuid4())
    monkeypatch.setattr(service, "_get_or_create_global_notebook", AsyncMock(return_value=global_notebook))

    delayed: list[str] = []
    monkeypatch.setattr("app.workers.tasks.ingest_source.delay", lambda source_id: delayed.append(source_id))

    result = await service.import_web_sources(
        [{"title": "Global Source", "url": "https://global.example.com/article"}],
    )

    assert result.notebook_id == global_notebook.id
    assert result.created_count == 1
    assert result.skipped_count == 0
    assert len(delayed) == 1
