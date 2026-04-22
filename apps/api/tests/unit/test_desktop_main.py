from __future__ import annotations

import os

from app.desktop_main import configure_desktop_environment


def test_configure_desktop_environment_defaults_to_local_sqlite(monkeypatch, tmp_path) -> None:
    state_dir = tmp_path / "desktop-state"
    monkeypatch.setenv("DESKTOP_STATE_DIR_OVERRIDE", str(state_dir))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("STORAGE_LOCAL_PATH", raising=False)
    monkeypatch.delenv("MEMORY_DIR", raising=False)

    configure_desktop_environment()

    assert state_dir.exists()
    assert os.environ["DATABASE_URL"] == (
        "sqlite+aiosqlite:///" + str((state_dir / "runtime-api.sqlite3").resolve())
    )
    assert os.environ["RUNTIME_PROFILE"] == "desktop"
    assert os.environ["MONITORING_ENABLED"] == "false"
    assert os.environ["STORAGE_LOCAL_PATH"] == str((state_dir / "storage").resolve())
    assert os.environ["MEMORY_DIR"] == str((state_dir / "memory").resolve())


def test_configure_desktop_environment_preserves_explicit_database_url(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("DESKTOP_STATE_DIR_OVERRIDE", str(tmp_path / "desktop-state"))
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:////tmp/custom.sqlite3")

    configure_desktop_environment()

    assert os.environ["DATABASE_URL"] == "sqlite+aiosqlite:////tmp/custom.sqlite3"
