use crate::{
    app::{build_app_menu, open_window, DesktopShell},
    runtime::{fetch_recent_items, DesktopRuntime, WatchManager},
    shared::{DesktopRecentItem, DesktopShortcutConfig, DesktopWindowKind, RuntimeStatus},
};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn global_shortcut_status(
    shell: State<'_, DesktopShell>,
) -> Result<DesktopShortcutConfig, String> {
    Ok(shell.shortcut_config())
}

#[tauri::command]
pub async fn global_shortcut_update(
    app: AppHandle,
    shell: State<'_, DesktopShell>,
    watch_manager: State<'_, WatchManager>,
    config: DesktopShortcutConfig,
) -> Result<DesktopShortcutConfig, String> {
    let next = shell.update_shortcut(&app, config)?;
    let menu = build_app_menu(&app, shell.inner(), watch_manager.inner())?;
    let _ = app.set_menu(menu);
    Ok(next)
}

#[tauri::command]
pub async fn tray_toggle_watchers(
    app: AppHandle,
    runtime: State<'_, DesktopRuntime>,
    watch_manager: State<'_, WatchManager>,
    shell: State<'_, DesktopShell>,
) -> Result<RuntimeStatus, String> {
    watch_manager.toggle_paused(&app, runtime.inner().clone())?;
    let menu = build_app_menu(&app, shell.inner(), watch_manager.inner())?;
    let _ = app.set_menu(menu);
    Ok(runtime.status())
}

#[tauri::command]
pub async fn quick_capture_open(app: AppHandle) -> Result<(), String> {
    open_window(
        &app,
        DesktopWindowKind::QuickCapture,
        Some(serde_json::json!({ "mode": "note" })),
    )
}

#[tauri::command]
pub async fn window_open(
    app: AppHandle,
    kind: DesktopWindowKind,
    payload: Option<serde_json::Value>,
) -> Result<(), String> {
    open_window(&app, kind, payload)
}

#[tauri::command]
pub async fn window_focus(app: AppHandle, label: String) -> Result<(), String> {
    crate::app::focus_window(&app, &label)
}

#[tauri::command]
pub async fn recent_items_list(
    runtime: State<'_, DesktopRuntime>,
) -> Result<Vec<DesktopRecentItem>, String> {
    fetch_recent_items(runtime.inner())
}
