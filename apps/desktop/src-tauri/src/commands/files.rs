use crate::{
    native::{compute_sha256_for_path, probe_file_metadata},
    platform::{copy_path_to_clipboard, open_path_with_default_app, show_notification},
    shared::{DesktopFileProbe, DesktopHashResult, DesktopNotification},
};
use std::path::Path;
use tauri::AppHandle;

#[tauri::command]
pub async fn notification_show(
    app: AppHandle,
    notification: DesktopNotification,
) -> Result<(), String> {
    show_notification(&app, notification)
}

#[tauri::command]
pub async fn file_open_default(path: String) -> Result<(), String> {
    open_path_with_default_app(&path)
}

#[tauri::command]
pub async fn file_copy_path(path: String) -> Result<(), String> {
    copy_path_to_clipboard(&path)
}

#[tauri::command]
pub async fn file_probe_metadata(path: String) -> Result<DesktopFileProbe, String> {
    probe_file_metadata(Path::new(&path))
}

#[tauri::command]
pub async fn file_compute_hash(path: String) -> Result<DesktopHashResult, String> {
    compute_sha256_for_path(Path::new(&path))
}
