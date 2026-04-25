# Desktop Local File Duplicate Detection

## Goal

Turn the existing Rust file hash/probe primitives and desktop SQLite state into a real duplicate-detection flow for local imports, so desktop uploads can skip already-imported files and watch-folder state can retain content fingerprints.

## Tasks

1. Extend desktop runtime state storage to persist file fingerprints and expose local-file inspection helpers.
2. Add a desktop API endpoint for inspecting a local file path against known desktop import state.
3. Record fingerprint metadata during desktop local-path imports and watch-folder ingestion.
4. Update the desktop knowledge-page upload flow to compute local hashes, inspect duplicates, skip duplicates, and notify the user.
5. Add backend/frontend regression tests and run desktop + API verification.

## Test Strategy

- `cd apps/api && .venv/bin/python -m pytest tests/unit/test_desktop_service.py tests/unit/test_source_service_dispatch.py -q`
- `cd apps/desktop/src-tauri && cargo test`
- `cd apps/desktop && pnpm test`
- `cd apps/desktop && pnpm build`

## Acceptance Criteria

- Desktop state stores a content fingerprint for imported local files when available.
- A local file inspection API can tell whether a file is new, unchanged, or a duplicate of another imported file.
- Knowledge-page local uploads skip duplicate files instead of blindly reimporting them.
- Watch-folder imports continue to skip unchanged files and now retain fingerprint metadata when available.
- Backend and desktop tests/build pass locally.
