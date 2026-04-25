use crate::{
    runtime::{now_iso_string, sidecar::resolved_state_dir, DesktopRuntime},
    shared::{SidecarEvent, WatchFolderRegistration},
};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::HashMap,
    fs,
    path::Path,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Runtime};

use super::state::WatchManager;

const IMPORT_EVENT_NAME: &str = "import://result";
const WATCHER_STATE_FILENAME: &str = "watchers-config.json";

impl WatchManager {
    pub fn hydrate<R: Runtime>(&self, app: &AppHandle<R>, runtime: &DesktopRuntime) {
        let paused = load_paused_state(&watcher_state_path(app)).unwrap_or(false);
        if let Ok(mut inner) = self.inner.lock() {
            inner.paused = paused;
        }
        runtime.set_watchers_paused(app, paused);
    }

    pub fn sync_folders<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        runtime: DesktopRuntime,
        folders: Vec<WatchFolderRegistration>,
    ) -> Result<(), String> {
        self.ensure_worker_started(app.clone(), runtime.clone());
        let pending = self.pending_paths.clone();
        let folder_snapshot = folders.clone();
        let watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
            let Ok(event) = result else { return };
            for path in event.paths {
                if !should_watch_path(&path) {
                    continue;
                }
                if let Ok(normalized) = normalize_path(&path) {
                    if let Ok(mut paths) = pending.lock() {
                        paths.insert(normalized, Instant::now());
                    }
                }
            }
        })
        .map_err(|error| format!("failed to create watch manager: {error}"))?;

        let watcher_count = folders.len();
        if let Err(error) = self.replace_watcher(watcher, folder_snapshot) {
            if let Ok(mut inner) = self.inner.lock() {
                inner.last_error = Some(error.clone());
            }
            return Err(error);
        }
        runtime.set_watcher_count(app, watcher_count);
        runtime.set_watchers_paused(app, self.is_paused());
        Ok(())
    }

    pub fn set_paused<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        runtime: DesktopRuntime,
        paused: bool,
    ) -> Result<bool, String> {
        {
            let mut inner = self
                .inner
                .lock()
                .map_err(|_| "watch manager mutex poisoned".to_string())?;
            inner.paused = paused;
        }
        persist_paused_state(&watcher_state_path(app), paused)?;
        runtime.set_watchers_paused(app, paused);
        Ok(paused)
    }

    pub fn toggle_paused<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        runtime: DesktopRuntime,
    ) -> Result<bool, String> {
        let next = !self.is_paused();
        self.set_paused(app, runtime, next)
    }

    fn replace_watcher(
        &self,
        mut watcher: RecommendedWatcher,
        folders: Vec<WatchFolderRegistration>,
    ) -> Result<(), String> {
        for folder in &folders {
            watcher
                .watch(Path::new(&folder.path), RecursiveMode::Recursive)
                .map_err(|error| format!("failed to watch '{}': {error}", folder.path))?;
        }

        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "watch manager mutex poisoned".to_string())?;
        inner.watcher = Some(watcher);
        inner.last_error = None;
        inner.watched_folders = folders;
        Ok(())
    }

    fn ensure_worker_started<R: Runtime>(&self, app: AppHandle<R>, runtime: DesktopRuntime) {
        let watch_inner = self.inner.clone();
        let should_start = {
            let mut inner = match self.inner.lock() {
                Ok(inner) => inner,
                Err(_) => return,
            };
            if inner.worker_started {
                false
            } else {
                inner.worker_started = true;
                true
            }
        };

        if !should_start {
            return;
        }

        let pending_paths = self.pending_paths.clone();
        thread::spawn(move || loop {
            let paused = watch_inner
                .lock()
                .map(|inner| inner.paused)
                .unwrap_or(false);
            if paused {
                thread::sleep(Duration::from_millis(200));
                continue;
            }
            let due_paths = take_due_paths(&pending_paths, Duration::from_millis(500));
            for path in due_paths {
                if let Err(error) = super::sidecar::post_watch_import(&runtime, &path) {
                    let _ = app.emit(
                        IMPORT_EVENT_NAME,
                        SidecarEvent {
                            event_type: "import.failed".to_string(),
                            payload: serde_json::json!({
                                "path": path,
                                "state": "failed",
                                "error": error,
                            }),
                            occurred_at: now_iso_string(),
                        },
                    );
                }
            }
            thread::sleep(Duration::from_millis(200));
        });
    }
}

fn watcher_state_path<R: Runtime>(app: &AppHandle<R>) -> std::path::PathBuf {
    resolved_state_dir(app).join(WATCHER_STATE_FILENAME)
}

fn load_paused_state(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read watcher state: {error}"))?;
    let payload: serde_json::Value =
        serde_json::from_str(&raw).map_err(|error| format!("invalid watcher state: {error}"))?;
    Ok(payload
        .get("paused")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false))
}

fn persist_paused_state(path: &Path, paused: bool) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create watcher state dir: {error}"))?;
    }
    let raw = serde_json::json!({ "paused": paused }).to_string();
    fs::write(path, raw).map_err(|error| format!("failed to persist watcher state: {error}"))
}

pub(crate) fn take_due_paths(
    pending_paths: &Arc<Mutex<HashMap<String, Instant>>>,
    debounce_window: Duration,
) -> Vec<String> {
    let mut paths = match pending_paths.lock() {
        Ok(paths) => paths,
        Err(_) => return Vec::new(),
    };
    let now = Instant::now();
    let due: Vec<String> = paths
        .iter()
        .filter_map(|(path, queued_at)| {
            if now.duration_since(*queued_at) >= debounce_window {
                Some(path.clone())
            } else {
                None
            }
        })
        .collect();
    for path in &due {
        paths.remove(path);
    }
    due
}

pub(crate) fn should_watch_path(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    matches!(
        extension.as_deref(),
        Some("pdf") | Some("md") | Some("txt") | Some("docx")
    )
}

fn normalize_path(path: &Path) -> Result<String, String> {
    let absolute = path
        .canonicalize()
        .map_err(|error| format!("failed to resolve path '{}': {error}", path.display()))?;
    Ok(absolute.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::{load_paused_state, persist_paused_state, should_watch_path, take_due_paths};
    use std::{
        collections::HashMap,
        fs,
        path::Path,
        sync::{Arc, Mutex},
        time::{Duration, Instant},
    };

    #[test]
    fn filters_supported_watch_paths() {
        assert!(should_watch_path(Path::new("/tmp/demo.pdf")));
        assert!(should_watch_path(Path::new("/tmp/demo.md")));
        assert!(!should_watch_path(Path::new("/tmp/demo.png")));
    }

    #[test]
    fn drains_only_due_debounce_entries() {
        let pending = Arc::new(Mutex::new(HashMap::from([
            (
                "ready".to_string(),
                Instant::now() - Duration::from_millis(900),
            ),
            ("waiting".to_string(), Instant::now()),
        ])));

        let due = take_due_paths(&pending, Duration::from_millis(500));

        assert_eq!(due, vec!["ready".to_string()]);
        let remaining = pending.lock().expect("pending paths lock");
        assert!(remaining.contains_key("waiting"));
        assert!(!remaining.contains_key("ready"));
    }

    #[test]
    fn persists_and_loads_paused_state() {
        let path = std::env::temp_dir().join("lyranote-watchers-state-test.json");
        persist_paused_state(&path, true).unwrap();
        assert!(load_paused_state(&path).unwrap());

        let _ = fs::remove_file(path);
    }
}
