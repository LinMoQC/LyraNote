use super::sidecar::default_log_dir;
use crate::shared::{RuntimeStatus, WatchFolderRegistration, WatcherDiagnostics};
use notify::RecommendedWatcher;
use std::{
    collections::HashMap,
    process::Child,
    sync::{Arc, Mutex},
    time::Instant,
};

#[derive(Clone)]
pub struct DesktopRuntime {
    pub(crate) inner: Arc<Mutex<RuntimeInner>>,
}

#[derive(Clone)]
pub struct WatchManager {
    pub(crate) inner: Arc<Mutex<WatchManagerInner>>,
    pub(crate) pending_paths: Arc<Mutex<HashMap<String, Instant>>>,
}

pub(crate) struct RuntimeInner {
    pub(crate) child: Option<Child>,
    pub(crate) status: RuntimeStatus,
    pub(crate) auto_restart_attempts: u32,
}

pub(crate) struct WatchManagerInner {
    pub(crate) watcher: Option<RecommendedWatcher>,
    pub(crate) worker_started: bool,
    pub(crate) paused: bool,
    pub(crate) watched_folders: Vec<WatchFolderRegistration>,
    pub(crate) last_error: Option<String>,
}

impl Default for DesktopRuntime {
    fn default() -> Self {
        let mut status = RuntimeStatus::default();
        status.log_path = default_log_dir().display().to_string();
        Self {
            inner: Arc::new(Mutex::new(RuntimeInner {
                child: None,
                status,
                auto_restart_attempts: 0,
            })),
        }
    }
}

impl Default for WatchManager {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(WatchManagerInner {
                watcher: None,
                worker_started: false,
                paused: false,
                watched_folders: Vec::new(),
                last_error: None,
            })),
            pending_paths: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl DesktopRuntime {
    pub fn status(&self) -> RuntimeStatus {
        self.inner
            .lock()
            .expect("runtime mutex poisoned")
            .status
            .clone()
    }
}

impl WatchManager {
    pub fn is_paused(&self) -> bool {
        self.inner.lock().map(|inner| inner.paused).unwrap_or(false)
    }

    pub fn diagnostics_snapshot(&self) -> WatcherDiagnostics {
        let (watcher_count, paused, watched_paths, last_error) = self
            .inner
            .lock()
            .map(|inner| {
                (
                    inner.watched_folders.len(),
                    inner.paused,
                    inner
                        .watched_folders
                        .iter()
                        .map(|folder| folder.path.clone())
                        .collect::<Vec<_>>(),
                    inner.last_error.clone(),
                )
            })
            .unwrap_or_else(|_| {
                (
                    0,
                    false,
                    Vec::new(),
                    Some("watch manager mutex poisoned".to_string()),
                )
            });
        let pending_paths_count = self
            .pending_paths
            .lock()
            .map(|pending| pending.len())
            .unwrap_or(0);

        WatcherDiagnostics {
            watcher_count,
            paused,
            watched_paths,
            pending_paths_count,
            last_error,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::WatchManager;
    use crate::shared::WatchFolderRegistration;
    use std::time::Instant;

    #[test]
    fn reports_watcher_diagnostics_snapshot() {
        let manager = WatchManager::default();
        {
            let mut inner = manager.inner.lock().expect("watch manager lock");
            inner.last_error = Some("watcher lost".into());
            inner.paused = true;
            inner.watched_folders = vec![WatchFolderRegistration {
                id: "folder-1".into(),
                path: "/tmp/notes".into(),
                name: "notes".into(),
                created_at: "2026-04-18T00:00:00Z".into(),
            }];
        }
        {
            let mut pending = manager.pending_paths.lock().expect("pending paths lock");
            pending.insert("/tmp/notes/demo.pdf".into(), Instant::now());
        }

        let snapshot = manager.diagnostics_snapshot();

        assert_eq!(snapshot.watcher_count, 1);
        assert!(snapshot.paused);
        assert_eq!(snapshot.pending_paths_count, 1);
        assert_eq!(snapshot.watched_paths, vec!["/tmp/notes".to_string()]);
        assert_eq!(snapshot.last_error.as_deref(), Some("watcher lost"));
    }
}
