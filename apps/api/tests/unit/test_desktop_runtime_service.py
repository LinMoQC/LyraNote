from __future__ import annotations

import sqlite3
import threading

from app.config import settings
from app.services.desktop_runtime_service import DesktopStateStore


def test_desktop_state_store_initialization_does_not_deadlock(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(settings, "desktop_state_dir_override", str(tmp_path / "desktop-state"))

    result: dict[str, object] = {}
    errors: list[BaseException] = []

    def _build_store() -> None:
        try:
            store = DesktopStateStore()
            result["db_path"] = store.db_path
        except BaseException as exc:  # pragma: no cover - assertion path captures this
            errors.append(exc)

    thread = threading.Thread(target=_build_store, daemon=True)
    thread.start()
    thread.join(timeout=2)

    assert not thread.is_alive(), "DesktopStateStore initialization deadlocked"
    assert not errors

    db_path = result["db_path"]
    assert db_path == (tmp_path / "desktop-state" / "runtime-state.sqlite3").resolve()

    with sqlite3.connect(db_path) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')"
            ).fetchall()
        }

    assert {
        "desktop_jobs",
        "watch_folders",
        "recent_imports",
        "watched_file_state",
        "desktop_chunk_fts",
    }.issubset(tables)
