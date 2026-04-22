# Desktop Watchers Pause Resume

## Goal

Turn watch folders into a controllable desktop runtime capability by adding watcher pause/resume support across Rust runtime state, native menus, and the knowledge page.

## Tasks

1. Add paused watcher state to Rust runtime/shared diagnostics models.
2. Persist watcher pause state in desktop state dir and hydrate it on startup.
3. Expose a `tray_toggle_watchers` Tauri command and wire it into the app menu.
4. Surface watcher paused/running state in desktop UI and allow toggling from the knowledge page.
5. Update tests and run Rust + desktop verification.

## Test Strategy

- `cd apps/desktop/src-tauri && cargo test`
- `cd apps/desktop && pnpm test`
- `cd apps/desktop && pnpm build`

## Acceptance Criteria

- Watch folders can be paused and resumed without removing registrations.
- Paused state survives app restart.
- The app menu and knowledge page both reflect the current paused/running state.
- Runtime status includes whether watchers are paused.
- Rust and desktop tests/build pass locally.
