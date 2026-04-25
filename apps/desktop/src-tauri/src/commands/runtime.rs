use crate::{
    platform::{
        dialog_pick_sources as pick_sources, dialog_pick_watch_folder as pick_watch_folder,
        reveal_path,
    },
    runtime::{DesktopRuntime, WatchManager},
    shared::{RuntimeStatus, SelectedPath, WatchFolderRegistration},
};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn runtime_status(
    app: AppHandle,
    runtime: State<'_, DesktopRuntime>,
) -> Result<RuntimeStatus, String> {
    runtime.ensure_started(&app)
}

#[tauri::command]
pub async fn runtime_restart(
    app: AppHandle,
    runtime: State<'_, DesktopRuntime>,
) -> Result<RuntimeStatus, String> {
    runtime.restart(&app)
}

#[tauri::command]
pub async fn dialog_pick_sources() -> Result<Vec<SelectedPath>, String> {
    pick_sources()
}

#[tauri::command]
pub async fn dialog_pick_watch_folder() -> Result<Option<SelectedPath>, String> {
    pick_watch_folder()
}

#[tauri::command]
pub async fn file_reveal(path: String) -> Result<(), String> {
    reveal_path(&path)
}

#[tauri::command]
pub async fn watch_folders_sync(
    app: AppHandle,
    runtime: State<'_, DesktopRuntime>,
    watch_manager: State<'_, WatchManager>,
    folders: Vec<WatchFolderRegistration>,
) -> Result<(), String> {
    watch_manager.sync_folders(&app, runtime.inner().clone(), folders)
}
