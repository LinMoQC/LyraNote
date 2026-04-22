use crate::{
    app::build_diagnostics_bundle,
    runtime::{
        authenticated_get_json, log_excerpt, now_iso_string, sidecar::runtime_environment_probe,
        DesktopRuntime, WatchManager,
    },
    shared::DesktopDiagnosticsBundleMeta,
};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn diagnostics_export(
    app: AppHandle,
    runtime: State<'_, DesktopRuntime>,
    watch_manager: State<'_, WatchManager>,
) -> Result<DesktopDiagnosticsBundleMeta, String> {
    let status = runtime.status();
    let watch_folders = authenticated_get_json(runtime.inner(), "/watch-folders")
        .unwrap_or_else(|_| serde_json::json!({ "items": [] }));
    let jobs = authenticated_get_json(runtime.inner(), "/jobs")
        .unwrap_or_else(|_| serde_json::json!({ "items": [] }));
    let recent_items = serde_json::to_value(crate::runtime::fetch_recent_items(runtime.inner())?)
        .map_err(|error| format!("failed to serialize recent items: {error}"))?;
    let generated_at = now_iso_string();
    let bundle = build_diagnostics_bundle(
        &status,
        watch_folders,
        jobs,
        recent_items,
        log_excerpt(&status.log_path, 80),
        generated_at.clone(),
        runtime_environment_probe(&app, Some(status.mode.clone())),
        watch_manager.diagnostics_snapshot(),
    );
    let diagnostics_dir = app
        .path()
        .app_data_dir()
        .map(|path| path.join("desktop").join("diagnostics"))
        .unwrap_or_else(|_| {
            PathBuf::from(format!(
                "{}/.lyranote/desktop/diagnostics",
                std::env::var("HOME").unwrap_or_default()
            ))
        });
    fs::create_dir_all(&diagnostics_dir)
        .map_err(|error| format!("failed to create diagnostics dir: {error}"))?;
    let path = diagnostics_dir.join(format!("diagnostics-{generated_at}.json"));
    let raw = serde_json::to_string_pretty(&bundle)
        .map_err(|error| format!("failed to serialize diagnostics bundle: {error}"))?;
    fs::write(&path, raw)
        .map_err(|error| format!("failed to write diagnostics bundle: {error}"))?;
    Ok(DesktopDiagnosticsBundleMeta {
        path: path.display().to_string(),
        generated_at,
        log_path: status.log_path,
    })
}
