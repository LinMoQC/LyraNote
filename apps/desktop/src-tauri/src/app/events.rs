use crate::shared::{
    DesktopRecentItem, DesktopShellEvent, DesktopShortcutConfig, RuntimeEnvironmentProbe,
    RuntimeStatus, WatcherDiagnostics,
};
use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use super::shortcuts::apply_global_shortcut;

pub const SHELL_EVENT_NAME: &str = "desktop://shell";

#[derive(Clone)]
pub struct DesktopShell {
    inner: Arc<Mutex<DesktopShellInner>>,
}

struct DesktopShellInner {
    shortcut: DesktopShortcutConfig,
}

impl Default for DesktopShell {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(DesktopShellInner {
                shortcut: DesktopShortcutConfig::default(),
            })),
        }
    }
}

impl DesktopShell {
    pub fn hydrate<R: Runtime>(&self, app: &AppHandle<R>) {
        let mut config = load_shortcut_config(app).unwrap_or_default();
        match apply_global_shortcut(app, &config) {
            Ok(supported) => {
                config.supported = supported;
            }
            Err(error) => {
                eprintln!("[desktop-shell] failed to hydrate global shortcut: {error}");
                config.supported = false;
            }
        }
        if let Ok(mut inner) = self.inner.lock() {
            inner.shortcut = config;
        }
        emit_shell_event(app, self);
    }

    pub fn shortcut_config(&self) -> DesktopShortcutConfig {
        self.inner
            .lock()
            .expect("desktop shell mutex poisoned")
            .shortcut
            .clone()
    }

    pub fn update_shortcut(
        &self,
        app: &AppHandle,
        mut config: DesktopShortcutConfig,
    ) -> Result<DesktopShortcutConfig, String> {
        config.supported = apply_global_shortcut(app, &config)?;
        {
            let mut inner = self
                .inner
                .lock()
                .map_err(|_| "desktop shell mutex poisoned".to_string())?;
            inner.shortcut = config.clone();
        }
        persist_shortcut_config(app, &config)?;
        emit_shell_event(app, self);
        Ok(config)
    }
}

pub fn emit_shell_event<R: Runtime>(app: &AppHandle<R>, shell: &DesktopShell) {
    let _ = app.emit(
        SHELL_EVENT_NAME,
        DesktopShellEvent {
            shortcut: shell.shortcut_config(),
        },
    );
}

fn shortcut_config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let state_dir = app
        .path()
        .app_data_dir()
        .map(|path| path.join("desktop"))
        .unwrap_or_else(|_| {
            PathBuf::from(format!(
                "{}/.lyranote/desktop",
                std::env::var("HOME").unwrap_or_default()
            ))
        });
    fs::create_dir_all(&state_dir)
        .map_err(|error| format!("failed to create desktop state dir: {error}"))?;
    Ok(state_dir.join("shell-config.json"))
}

fn load_shortcut_config<R: Runtime>(app: &AppHandle<R>) -> Option<DesktopShortcutConfig> {
    let path = shortcut_config_path(app).ok()?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn persist_shortcut_config<R: Runtime>(
    app: &AppHandle<R>,
    config: &DesktopShortcutConfig,
) -> Result<(), String> {
    let path = shortcut_config_path(app)?;
    let raw = serde_json::to_string_pretty(config)
        .map_err(|error| format!("failed to serialize shortcut config: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("failed to persist shortcut config: {error}"))
}

pub fn trim_recent_items(items: Vec<DesktopRecentItem>) -> Vec<DesktopRecentItem> {
    let mut deduped = Vec::new();
    for item in items {
        let exists = deduped.iter().any(|existing: &DesktopRecentItem| {
            existing.path == item.path && existing.title == item.title
        });
        if !exists {
            deduped.push(item);
        }
        if deduped.len() >= 8 {
            break;
        }
    }
    deduped
}

pub fn build_diagnostics_bundle(
    status: &RuntimeStatus,
    watch_folders: Value,
    jobs: Value,
    recent_items: Value,
    log_excerpt: Vec<String>,
    generated_at: String,
    environment: RuntimeEnvironmentProbe,
    watcher_diagnostics: WatcherDiagnostics,
) -> Value {
    serde_json::json!({
        "generated_at": generated_at,
        "runtime": {
            "state": status.state.clone(),
            "mode": status.mode.clone(),
            "pid": status.pid,
            "version": status.version.clone(),
            "health_url": status.health_url.clone(),
            "api_base_url": status.api_base_url.clone(),
            "last_error": status.last_error.clone(),
            "last_exit_reason": status.last_exit_reason.clone(),
            "last_healthcheck_at": status.last_healthcheck_at.clone(),
            "last_heartbeat_at": status.last_heartbeat_at.clone(),
            "log_path": status.log_path.clone(),
            "state_dir": status.state_dir.clone(),
            "sidecar_path": status.sidecar_path.clone(),
            "restart_count": status.restart_count,
            "watcher_count": status.watcher_count,
            "last_restart_at": status.last_restart_at.clone(),
        },
        "environment": environment,
        "watcher_diagnostics": watcher_diagnostics,
        "watch_folders": watch_folders,
        "jobs": jobs,
        "recent_items": recent_items,
        "log_excerpt": log_excerpt,
    })
}

#[cfg(test)]
mod tests {
    use super::{build_diagnostics_bundle, trim_recent_items};
    use crate::shared::{
        DesktopRecentItem, DesktopRuntimeState, RuntimeEnvironmentProbe, RuntimeStatus,
        WatcherDiagnostics,
    };
    use serde_json::json;

    #[test]
    fn trims_recent_items_without_duplicates() {
        let items = trim_recent_items(vec![
            DesktopRecentItem {
                kind: "import".into(),
                title: "A.pdf".into(),
                subtitle: None,
                path: Some("/tmp/A.pdf".into()),
                source_id: None,
                created_at: "2026-04-17T10:00:00Z".into(),
            },
            DesktopRecentItem {
                kind: "import".into(),
                title: "A.pdf".into(),
                subtitle: None,
                path: Some("/tmp/A.pdf".into()),
                source_id: None,
                created_at: "2026-04-17T10:00:01Z".into(),
            },
            DesktopRecentItem {
                kind: "import".into(),
                title: "B.pdf".into(),
                subtitle: None,
                path: Some("/tmp/B.pdf".into()),
                source_id: None,
                created_at: "2026-04-17T10:00:02Z".into(),
            },
        ]);

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].title, "A.pdf");
        assert_eq!(items[1].title, "B.pdf");
    }

    #[test]
    fn builds_diagnostics_json_payload() {
        let bundle = build_diagnostics_bundle(
            &RuntimeStatus {
                state: DesktopRuntimeState::Ready,
                mode: "bundled".into(),
                health_url: "http://127.0.0.1:8123/health".into(),
                api_base_url: "http://127.0.0.1:8123/api/v1".into(),
                pid: Some(321),
                version: Some("0.3.0".into()),
                last_error: None,
                last_exit_reason: Some("sidecar exited".into()),
                last_healthcheck_at: Some("2026-04-17T10:00:00Z".into()),
                last_heartbeat_at: Some("2026-04-17T10:00:05Z".into()),
                log_path: "/tmp/logs".into(),
                state_dir: "/tmp/state".into(),
                sidecar_path: Some("/tmp/lyranote-api-desktop".into()),
                restart_count: 1,
                watcher_count: 2,
                watchers_paused: true,
                last_restart_at: Some("2026-04-17T09:59:00Z".into()),
            },
            json!([{ "path": "/tmp/notes" }]),
            json!([{ "id": "job-1" }]),
            json!([{ "title": "A.pdf" }]),
            vec!["line-1".into()],
            "2026-04-17T10:00:00Z".into(),
            RuntimeEnvironmentProbe {
                runtime_mode: "bundled".into(),
                api_dir: "/tmp/api".into(),
                resource_dir: Some("/tmp/resources".into()),
                state_dir: "/tmp/state".into(),
                log_dir: "/tmp/logs".into(),
                sidecar_path: Some("/tmp/lyranote-api-desktop".into()),
            },
            WatcherDiagnostics {
                watcher_count: 2,
                watched_paths: vec!["/tmp/notes".into()],
                pending_paths_count: 1,
                last_error: None,
                paused: true,
            },
        );

        assert_eq!(bundle["runtime"]["mode"], "bundled");
        assert_eq!(bundle["runtime"]["restart_count"], 1);
        assert_eq!(bundle["runtime"]["last_exit_reason"], "sidecar exited");
        assert_eq!(bundle["watch_folders"][0]["path"], "/tmp/notes");
        assert_eq!(bundle["environment"]["api_dir"], "/tmp/api");
        assert_eq!(bundle["watcher_diagnostics"]["pending_paths_count"], 1);
        assert_eq!(bundle["watcher_diagnostics"]["paused"], true);
        assert_eq!(bundle["jobs"][0]["id"], "job-1");
        assert_eq!(bundle["log_excerpt"][0], "line-1");
    }
}
