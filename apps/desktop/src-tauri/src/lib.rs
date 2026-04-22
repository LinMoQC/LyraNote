mod app;
mod commands;
mod native;
mod platform;
mod runtime;
mod security;
mod shared;

use app::{build_app_menu, handle_menu_event, handle_run_event, setup_app, DesktopShell};
use commands::{
    diagnostics::diagnostics_export,
    files::{
        file_compute_hash, file_copy_path, file_open_default, file_probe_metadata,
        notification_show,
    },
    runtime::{
        dialog_pick_sources, dialog_pick_watch_folder, file_reveal, runtime_restart,
        runtime_status, watch_folders_sync,
    },
    security::{
        secure_secret_delete, secure_secret_get, secure_secret_list_keys, secure_secret_store,
        session_clear, session_hydrate, session_store,
    },
    shell::{
        global_shortcut_status, global_shortcut_update, quick_capture_open,
        recent_items_list, tray_toggle_watchers, window_focus, window_open,
    },
};
use runtime::{DesktopRuntime, WatchManager};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = DesktopRuntime::default();
    let watch_manager = WatchManager::default();
    let shell = DesktopShell::default();

    tauri::Builder::default()
        .manage(runtime)
        .manage(watch_manager)
        .manage(shell)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .menu(|app| {
            let shell = app.state::<DesktopShell>();
            let watch_manager = app.state::<WatchManager>();
            match build_app_menu(app, shell.inner(), watch_manager.inner()) {
                Ok(menu) => Ok(menu),
                Err(error) => {
                    eprintln!("[desktop-shell] failed to build app menu: {error}");
                    tauri::menu::Menu::new(app)
                }
            }
        })
        .on_menu_event(|app, event| {
            let runtime = app.state::<DesktopRuntime>();
            let shell = app.state::<DesktopShell>();
            let watch_manager = app.state::<WatchManager>();
            handle_menu_event(
                app,
                event,
                runtime.inner(),
                shell.inner(),
                watch_manager.inner(),
            );
        })
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            runtime_restart,
            session_hydrate,
            session_store,
            session_clear,
            secure_secret_store,
            secure_secret_get,
            secure_secret_delete,
            secure_secret_list_keys,
            dialog_pick_sources,
            dialog_pick_watch_folder,
            file_reveal,
            notification_show,
            watch_folders_sync,
            global_shortcut_status,
            global_shortcut_update,
            tray_toggle_watchers,
            quick_capture_open,
            window_open,
            window_focus,
            recent_items_list,
            diagnostics_export,
            file_open_default,
            file_copy_path,
            file_probe_metadata,
            file_compute_hash
        ])
        .setup(setup_app)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(handle_run_event);
}
