from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest

from app.exceptions import BadRequestError
from app.services.desktop_runtime_service import desktop_state_store
from app.services.desktop_service import DesktopService


class _AsyncSessionStub:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.fixture(autouse=True)
def desktop_state_env(monkeypatch, tmp_path):
    monkeypatch.setattr("app.config.settings.runtime_profile", "desktop")
    monkeypatch.setattr(
        "app.config.settings.desktop_state_dir_override",
        str(tmp_path / "desktop-state"),
    )
    monkeypatch.setattr(
        "app.services.desktop_agent_service.desktop_job_manager.ensure_started",
        lambda: None,
    )
    monkeypatch.setattr(
        "app.services.desktop_knowledge_service.desktop_job_manager.ensure_started",
        lambda: None,
    )
    yield


def test_watch_folder_registry_adds_lists_and_deletes(tmp_path) -> None:
    service = DesktopService()
    user_id = str(uuid.uuid4())
    watched_dir = tmp_path / "notes"
    watched_dir.mkdir()

    created = service.create_watch_folder(user_id=user_id, path=str(watched_dir))
    assert created["path"] == str(watched_dir.resolve())
    assert created["name"] == "notes"
    assert created["last_synced_at"] is None
    assert created["last_error"] is None
    assert created["is_active"] is True

    listed = service.list_watch_folders(user_id=user_id)
    assert len(listed["items"]) == 1
    assert listed["items"][0]["id"] == created["id"]

    service.delete_watch_folder(user_id=user_id, folder_id=created["id"])
    assert service.list_watch_folders(user_id=user_id) == {"items": []}


def test_watch_folder_registry_rejects_duplicates(tmp_path) -> None:
    service = DesktopService()
    user_id = str(uuid.uuid4())
    watched_dir = tmp_path / "papers"
    watched_dir.mkdir()

    service.create_watch_folder(user_id=user_id, path=str(watched_dir))

    with pytest.raises(BadRequestError, match="已注册"):
        service.create_watch_folder(user_id=user_id, path=str(watched_dir))


def test_jobs_list_and_cancel_queued_job() -> None:
    service = DesktopService()
    user_id = str(uuid.uuid4())
    job = desktop_state_store.create_job(
        user_id=user_id,
        kind="import",
        label="索引资料：paper.pdf",
        resource_id="source-1",
        payload={"source_id": "source-1"},
    )

    listed = service.list_jobs(user_id=user_id)
    assert listed["items"][0]["id"] == job["id"]
    assert listed["items"][0]["state"] == "queued"

    cancelled = service.cancel_job(user_id=user_id, job_id=str(job["id"]))
    assert cancelled == {"cancelled": True, "reason": None}

    listed_after = service.list_jobs(user_id=user_id)
    assert listed_after["items"][0]["state"] == "cancelled"


@pytest.mark.asyncio
async def test_import_watch_folder_path_skips_repeated_unchanged_files(
    monkeypatch,
    tmp_path,
) -> None:
    service = DesktopService()
    user_id = str(uuid.uuid4())
    watched_dir = tmp_path / "incoming"
    watched_dir.mkdir()
    file_path = watched_dir / "report.md"
    file_path.write_text("# report", encoding="utf-8")

    service.create_watch_folder(user_id=user_id, path=str(watched_dir))
    monkeypatch.setattr("app.services.desktop_knowledge_service.AsyncSessionLocal", _AsyncSessionStub)
    async def _import(path: str, sha256: str | None = None):
        source = type("SourceStub", (), {"id": uuid.uuid4()})()
        desktop_state_store.record_import(
            user_id=user_id,
            path=path,
            source_id=str(source.id),
            title=file_path.name,
            sha256=sha256,
        )
        return source

    import_mock = AsyncMock(side_effect=_import)
    monkeypatch.setattr(
        "app.services.desktop_knowledge_service.SourceService.import_global_source_path",
        import_mock,
    )

    first = await service.import_watch_folder_path(user_id=user_id, path=str(file_path))
    second = await service.import_watch_folder_path(user_id=user_id, path=str(file_path))

    assert first["state"] == "queued"
    assert second == {"state": "skipped", "path": str(file_path.resolve())}
    assert import_mock.await_count == 1

    folder = service.list_watch_folders(user_id=user_id)["items"][0]
    assert folder["last_synced_at"] is not None
    assert folder["last_error"] is None


def test_recent_imports_reflect_recorded_history(tmp_path) -> None:
    service = DesktopService()
    user_id = str(uuid.uuid4())
    file_path = tmp_path / "summary.txt"
    file_path.write_text("summary", encoding="utf-8")

    desktop_state_store.record_import(
        user_id=user_id,
        path=str(file_path),
        source_id="source-99",
        title="summary.txt",
    )

    recent = service.list_recent_imports(user_id=user_id)
    assert recent["items"] == [
        {
            "path": str(file_path.resolve()),
            "source_id": "source-99",
            "title": "summary.txt",
            "imported_at": recent["items"][0]["imported_at"],
        }
    ]


def test_inspect_local_file_detects_duplicate_content(tmp_path) -> None:
    service = DesktopService()
    user_id = str(uuid.uuid4())
    original = tmp_path / "paper-a.pdf"
    duplicate = tmp_path / "paper-b.pdf"
    original.write_text("same-content", encoding="utf-8")
    duplicate.write_text("same-content", encoding="utf-8")

    desktop_state_store.record_import(
        user_id=user_id,
        path=str(original),
        source_id="source-1",
        title="paper-a.pdf",
        sha256="digest-1",
    )

    inspection = service.inspect_local_file(
        user_id=user_id,
        path=str(duplicate),
        sha256="digest-1",
    )

    assert inspection == {
        "state": "duplicate",
        "path": str(duplicate.resolve()),
        "source_id": "source-1",
        "matched_path": str(original.resolve()),
        "matched_title": "paper-a.pdf",
        "sha256": "digest-1",
    }


@pytest.mark.asyncio
async def test_import_watch_folder_path_returns_duplicate_without_reimport(
    monkeypatch,
    tmp_path,
) -> None:
    service = DesktopService()
    user_id = str(uuid.uuid4())
    watched_dir = tmp_path / "incoming"
    watched_dir.mkdir()
    original = watched_dir / "paper-a.md"
    duplicate = watched_dir / "paper-b.md"
    original.write_text("# same", encoding="utf-8")
    duplicate.write_text("# same", encoding="utf-8")

    service.create_watch_folder(user_id=user_id, path=str(watched_dir))
    desktop_state_store.record_import(
        user_id=user_id,
        path=str(original),
        source_id="source-existing",
        title="paper-a.md",
        sha256="known-digest",
    )

    monkeypatch.setattr(
        "app.services.desktop_knowledge_service.compute_file_sha256",
        lambda path: "known-digest",
    )
    import_mock = AsyncMock()
    monkeypatch.setattr(
        "app.services.desktop_knowledge_service.SourceService.import_global_source_path",
        import_mock,
    )

    result = await service.import_watch_folder_path(user_id=user_id, path=str(duplicate))

    assert result == {
        "state": "duplicate",
        "path": str(duplicate.resolve()),
        "source_id": "source-existing",
    }
    import_mock.assert_not_awaited()
