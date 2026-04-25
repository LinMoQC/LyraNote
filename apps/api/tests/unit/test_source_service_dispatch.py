from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.exceptions import NotFoundError
from app.models import ObservabilityRun, Source
from app.services.desktop_runtime_service import desktop_state_store
from app.services.source_service import SourceService


@pytest.mark.asyncio
async def test_upload_source_dispatches_ingestion_after_commit(monkeypatch) -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if isinstance(obj, Source) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())
            if isinstance(obj, ObservabilityRun) and getattr(obj, "id", None) is None:
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

    delayed: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(
        "app.workers.tasks.ingest_source.delay",
        lambda source_id, **kwargs: delayed.append((source_id, kwargs)),
    )

    source = await service.upload_source(notebook_id, "demo.pdf", b"pdf-bytes")

    assert source.status == "pending"
    assert delayed == []

    callbacks = db.sync_session.info.get("_after_commit_callbacks", [])
    assert len(callbacks) == 1
    callbacks[0]()

    assert delayed[0][0] == str(source.id)
    assert delayed[0][1]["trace_id"]
    assert delayed[0][1]["run_id"]
    storage.upload.assert_awaited_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_import_source_url_dispatches_ingestion_after_commit(monkeypatch) -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if isinstance(obj, Source) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())
            if isinstance(obj, ObservabilityRun) and getattr(obj, "id", None) is None:
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

    delayed: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(
        "app.workers.tasks.ingest_source.delay",
        lambda source_id, **kwargs: delayed.append((source_id, kwargs)),
    )

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
    assert delayed[0][0] == str(source.id)
    assert delayed[0][1]["trace_id"]
    assert delayed[0][1]["run_id"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_upload_global_source_dispatches_ingestion_after_commit(monkeypatch) -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if isinstance(obj, Source) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())
            if isinstance(obj, ObservabilityRun) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())

    db = SimpleNamespace(
        add=Mock(side_effect=added.append),
        flush=AsyncMock(side_effect=flush),
        refresh=AsyncMock(return_value=None),
        commit=AsyncMock(return_value=None),
        sync_session=SimpleNamespace(info={}),
    )
    service = SourceService(db, uuid.uuid4())
    service._get_or_create_global_notebook = AsyncMock(  # type: ignore[method-assign]
        return_value=SimpleNamespace(id=uuid.uuid4())
    )

    storage = SimpleNamespace(upload=AsyncMock(return_value=None))
    monkeypatch.setattr("app.providers.storage.storage", lambda: storage)

    delayed: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(
        "app.workers.tasks.ingest_source.delay",
        lambda source_id, **kwargs: delayed.append((source_id, kwargs)),
    )

    source = await service.upload_global_source("global.docx", b"doc-bytes")

    assert source.status == "pending"
    assert source.type == "doc"
    assert delayed == []

    callbacks = db.sync_session.info.get("_after_commit_callbacks", [])
    assert len(callbacks) == 1
    callbacks[0]()

    assert delayed[0][0] == str(source.id)
    assert delayed[0][1]["trace_id"]
    assert delayed[0][1]["run_id"]
    storage.upload.assert_awaited_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_import_global_source_url_dispatches_ingestion_after_commit(
    monkeypatch,
) -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if isinstance(obj, Source) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())
            if isinstance(obj, ObservabilityRun) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())

    db = SimpleNamespace(
        add=Mock(side_effect=added.append),
        flush=AsyncMock(side_effect=flush),
        refresh=AsyncMock(return_value=None),
        commit=AsyncMock(return_value=None),
        sync_session=SimpleNamespace(info={}),
    )
    service = SourceService(db, uuid.uuid4())
    service._get_or_create_global_notebook = AsyncMock(  # type: ignore[method-assign]
        return_value=SimpleNamespace(id=uuid.uuid4())
    )

    delayed: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(
        "app.workers.tasks.ingest_source.delay",
        lambda source_id, **kwargs: delayed.append((source_id, kwargs)),
    )

    source = await service.import_global_source_url(
        "https://example.com/global",
        "Global Example",
    )

    assert source.status == "pending"
    assert delayed == []

    callbacks = db.sync_session.info.get("_after_commit_callbacks", [])
    assert len(callbacks) == 1
    callbacks[0]()

    assert delayed[0][0] == str(source.id)
    assert delayed[0][1]["trace_id"]
    assert delayed[0][1]["run_id"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_rechunk_source_dispatches_ingestion_after_commit_with_trace_context(
    monkeypatch,
) -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if isinstance(obj, ObservabilityRun) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())

    db = SimpleNamespace(
        add=Mock(side_effect=added.append),
        flush=AsyncMock(side_effect=flush),
        commit=AsyncMock(return_value=None),
        sync_session=SimpleNamespace(info={}),
    )
    service = SourceService(db, uuid.uuid4())
    source = SimpleNamespace(
        id=uuid.uuid4(),
        notebook_id=uuid.uuid4(),
        title="demo.pdf",
        type="pdf",
        url=None,
        status="indexed",
    )
    monkeypatch.setattr(service, "_get_owned_source", AsyncMock(return_value=source))

    apply_async_calls: list[dict[str, object]] = []
    monkeypatch.setattr(
        "app.workers.tasks.ingest_source.apply_async",
        lambda *args, **kwargs: apply_async_calls.append(
            {"args": list(args), "kwargs": kwargs}
        ),
    )

    chunk_size, chunk_overlap = await service.rechunk_source(
        source.id,
        strategy="standard",
    )

    assert source.status == "pending"
    assert chunk_size == 512
    assert chunk_overlap == 64
    assert apply_async_calls == []

    callbacks = db.sync_session.info.get("_after_commit_callbacks", [])
    assert len(callbacks) == 1
    callbacks[0]()

    dispatched = apply_async_calls[0]
    assert dispatched["kwargs"]["args"] == [str(source.id)]
    assert dispatched["kwargs"]["kwargs"]["trace_id"]
    assert dispatched["kwargs"]["kwargs"]["run_id"]
    assert dispatched["kwargs"]["kwargs"]["chunk_size"] == chunk_size
    assert dispatched["kwargs"]["kwargs"]["chunk_overlap"] == chunk_overlap
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_import_global_source_path_reads_file_and_delegates(
    tmp_path,
    monkeypatch,
) -> None:
    service = SourceService(SimpleNamespace(), uuid.uuid4())
    file_path = tmp_path / "notes.md"
    file_path.write_text("# Desktop import", encoding="utf-8")

    upload_mock = AsyncMock(return_value="source")
    monkeypatch.setattr(service, "upload_global_source", upload_mock)

    result = await service.import_global_source_path(str(file_path))

    assert result == "source"
    upload_mock.assert_awaited_once_with("notes.md", b"# Desktop import")


@pytest.mark.asyncio
async def test_import_global_source_path_rejects_missing_files() -> None:
    service = SourceService(SimpleNamespace(), uuid.uuid4())

    with pytest.raises(NotFoundError, match="文件不存在"):
        await service.import_global_source_path("/tmp/lyranote-missing-file.pdf")


@pytest.mark.asyncio
async def test_upload_source_uses_desktop_job_queue_when_runtime_profile_is_desktop(
    monkeypatch,
) -> None:
    added: list[object] = []

    async def flush() -> None:
        for obj in added:
            if isinstance(obj, Source) and getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())
            if isinstance(obj, ObservabilityRun) and getattr(obj, "id", None) is None:
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
    monkeypatch.setattr("app.config.settings.runtime_profile", "desktop")

    queued: list[dict[str, object]] = []
    monkeypatch.setattr(
        "app.services.desktop_runtime_service.desktop_job_manager.enqueue_source_ingest",
        lambda **payload: queued.append(payload) or "job-1",
    )
    monkeypatch.setattr("app.workers.tasks.ingest_source.delay", lambda source_id: (_ for _ in ()).throw(AssertionError("celery should not run")))

    source = await service.upload_source(notebook_id, "desktop.pdf", b"pdf-bytes")

    callbacks = db.sync_session.info.get("_after_commit_callbacks", [])
    assert len(callbacks) == 1
    callbacks[0]()

    assert source.status == "pending"
    assert queued[0]["trace_id"]
    assert queued[0]["run_id"]
    assert queued == [
        {
            "user_id": str(service.user_id),
            "source_id": str(source.id),
            "trace_id": queued[0]["trace_id"],
            "run_id": queued[0]["run_id"],
            "kind": "import",
            "label": "索引资料：desktop.pdf",
            "chunk_size": None,
            "chunk_overlap": None,
            "splitter_type": None,
            "separators": None,
            "min_chunk_size": None,
        }
    ]


@pytest.mark.asyncio
async def test_import_global_source_path_reuses_existing_source_for_duplicate_content(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.config.settings.runtime_profile", "desktop")
    monkeypatch.setattr(
        "app.config.settings.desktop_state_dir_override",
        str(tmp_path / "desktop-state"),
    )

    service = SourceService(SimpleNamespace(), uuid.uuid4())
    original = tmp_path / "paper-a.md"
    duplicate = tmp_path / "paper-b.md"
    original.write_text("same-content", encoding="utf-8")
    duplicate.write_text("same-content", encoding="utf-8")

    desktop_state_store.record_import(
        user_id=str(service.user_id),
        path=str(original),
        source_id=str(uuid.uuid4()),
        title="paper-a.md",
        sha256="digest-1",
    )

    existing = SimpleNamespace(id=uuid.uuid4(), title="paper-a.md")
    monkeypatch.setattr(service, "_get_owned_source", AsyncMock(return_value=existing))
    upload_mock = AsyncMock()
    monkeypatch.setattr(service, "upload_global_source", upload_mock)

    result = await service.import_global_source_path(str(duplicate), sha256="digest-1")

    assert result is existing
    upload_mock.assert_not_awaited()
