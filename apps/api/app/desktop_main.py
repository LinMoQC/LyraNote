from __future__ import annotations

import argparse
import os
from pathlib import Path

import uvicorn


def desktop_state_dir() -> Path:
    override = os.environ.get("DESKTOP_STATE_DIR_OVERRIDE", "").strip()
    state_dir = Path(override).expanduser() if override else Path.home() / ".lyranote" / "desktop"
    state_dir = state_dir.resolve()
    state_dir.mkdir(parents=True, exist_ok=True)
    return state_dir


def configure_desktop_environment() -> None:
    state_dir = desktop_state_dir()

    os.environ.setdefault("RUNTIME_PROFILE", "desktop")
    os.environ.setdefault("DESKTOP_STDOUT_EVENTS", "true")
    os.environ.setdefault("MEMORY_MODE", "desktop")
    os.environ.setdefault("MONITORING_ENABLED", "false")
    os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{state_dir / 'runtime-api.sqlite3'}")
    os.environ.setdefault("STORAGE_BACKEND", "local")
    os.environ.setdefault("STORAGE_LOCAL_PATH", str(state_dir / "storage"))
    os.environ.setdefault("MEMORY_DIR", str(state_dir / "memory"))
    os.environ.setdefault(
        "CORS_ORIGINS",
        "http://tauri.localhost,tauri://localhost,http://localhost:1420,http://127.0.0.1:1420",
    )
    os.environ.setdefault("FRONTEND_URL", "http://tauri.localhost")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the LyraNote desktop sidecar API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    configure_desktop_environment()

    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
