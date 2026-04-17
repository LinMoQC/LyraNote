from __future__ import annotations

import uuid

import pytest

from app.services.desktop_service import DesktopService


def test_watch_folder_registry_adds_lists_and_deletes(monkeypatch, tmp_path) -> None:
    service = DesktopService()
    user_id = str(uuid.uuid4())
    watched_dir = tmp_path / "notes"
    watched_dir.mkdir()

    monkeypatch.setattr("app.services.desktop_service.settings.desktop_state_dir_override", str(tmp_path / "desktop-state"))

    created = service.create_watch_folder(user_id=user_id, path=str(watched_dir))
    assert created["path"] == str(watched_dir.resolve())
    assert created["name"] == "notes"

    listed = service.list_watch_folders(user_id=user_id)
    assert len(listed["items"]) == 1
    assert listed["items"][0]["id"] == created["id"]

    service.delete_watch_folder(user_id=user_id, folder_id=created["id"])
    assert service.list_watch_folders(user_id=user_id) == {"items": []}


def test_watch_folder_registry_rejects_duplicates(monkeypatch, tmp_path) -> None:
    service = DesktopService()
    user_id = str(uuid.uuid4())
    watched_dir = tmp_path / "papers"
    watched_dir.mkdir()

    monkeypatch.setattr("app.services.desktop_service.settings.desktop_state_dir_override", str(tmp_path / "desktop-state"))

    service.create_watch_folder(user_id=user_id, path=str(watched_dir))

    with pytest.raises(Exception) as exc_info:
        service.create_watch_folder(user_id=user_id, path=str(watched_dir))

    assert "已注册" in str(exc_info.value)
