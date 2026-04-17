mod runtime;
mod session;

use runtime::{dialog_pick_sources as pick_sources, reveal_path, show_notification, DesktopNotification, DesktopRuntime};
use session::{clear_session, hydrate_session, store_session, SecureSession, SecureSessionRecord};
use tauri::Manager;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[tauri::command]
async fn runtime_status(
    app: tauri::AppHandle,
    runtime: tauri::State<'_, DesktopRuntime>,
) -> Result<runtime::RuntimeStatus, String> {
    runtime.ensure_started(&app)
}

#[tauri::command]
async fn runtime_restart(
    app: tauri::AppHandle,
    runtime: tauri::State<'_, DesktopRuntime>,
) -> Result<runtime::RuntimeStatus, String> {
    runtime.restart(&app)
}

#[tauri::command]
async fn session_hydrate() -> Result<SecureSession, String> {
    hydrate_session()
}

#[tauri::command]
async fn session_store(payload: SecureSessionRecord) -> Result<SecureSession, String> {
    store_session(payload)
}

#[tauri::command]
async fn session_clear() -> Result<(), String> {
    clear_session()
}

#[tauri::command]
async fn dialog_pick_sources() -> Result<Vec<runtime::SelectedPath>, String> {
    pick_sources()
}

#[tauri::command]
async fn file_reveal(path: String) -> Result<(), String> {
    reveal_path(&path)
}

#[tauri::command]
async fn notification_show(notification: DesktopNotification) -> Result<(), String> {
    show_notification(notification)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = DesktopRuntime::default();
    tauri::Builder::default()
        .manage(runtime)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            runtime_restart,
            session_hydrate,
            session_store,
            session_clear,
            dialog_pick_sources,
            file_reveal,
            notification_show
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, Some(12.0))
                .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

            let runtime = app.state::<DesktopRuntime>();
            let _ = runtime.ensure_started(&app.handle());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let runtime = app.state::<DesktopRuntime>();
                let _ = runtime.stop();
            }
        });
}
