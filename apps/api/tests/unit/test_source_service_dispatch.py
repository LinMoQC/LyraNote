from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.models import Source
from app.services.source_service import SourceService


@pytest.mark.asyncio
async def test_upload_source_dispatches_ingestion_after_commit(monkeypatch) -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if isinstance(obj, Source) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())

    db = SimpleNamespace(
        add=Mock(side_effect=added.append),
        flush=AsyncMock(side_effect=flush),
        refresh=AsyncMock(return_value=None),
        commit=AsyncMock(return_value=None),
        sync_session=SimpleNamespace(info={}),
    )
    service = SourceService(db, uuid.uuid4())
    notebook_id = uuid.uuid4()
    monkeypatch.setattr(service, "_assert_notebook_owner", AsyncMock(return_value=None))

    storage = SimpleNamespace(upload=AsyncMock(return_value=None))
    monkeypatch.setattr("app.providers.storage.storage", lambda: storage)

    delayed: list[str] = []
    monkeypatch.setattr("app.workers.tasks.ingest_source.delay", lambda source_id: delayed.append(source_id))

    source = await service.upload_source(notebook_id, "demo.pdf", b"pdf-bytes")

    assert source.status == "pending"
    assert delayed == []

    callbacks = db.sync_session.info.get("_after_commit_callbacks", [])
    assert len(callbacks) == 1
    callbacks[0]()

    assert delayed == [str(source.id)]
    storage.upload.assert_awaited_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_import_source_url_dispatches_ingestion_after_commit(monkeypatch) -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if isinstance(obj, Source) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())

    db = SimpleNamespace(
        add=Mock(side_effect=added.append),
        flush=AsyncMock(side_effect=flush),
        refresh=AsyncMock(return_value=None),
        commit=AsyncMock(return_value=None),
        sync_session=SimpleNamespace(info={}),
    )
    service = SourceService(db, uuid.uuid4())
    service._assert_notebook_owner = AsyncMock(return_value=None)  # type: ignore[method-assign]

    delayed: list[str] = []
    monkeypatch.setattr("app.workers.tasks.ingest_source.delay", lambda source_id: delayed.append(source_id))

    source = await service.import_source_url(
        uuid.uuid4(),
        "https://example.com/post",
        "Example Post",
    )

    assert source.status == "pending"
    assert delayed == []

    callbacks = db.sync_session.info.get("_after_commit_callbacks", [])
    assert len(callbacks) == 1
    callbacks[0]()
    assert delayed == [str(source.id)]
    db.commit.assert_awaited_once()
