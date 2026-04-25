use crate::{
    security::{
        clear_session, delete_secret, get_secret, hydrate_session, list_secret_keys, store_secret,
        store_session,
    },
    shared::{DesktopSecretKey, SecureSession, SecureSessionRecord},
};
use tauri::{AppHandle, Runtime};

#[tauri::command]
pub async fn session_hydrate() -> Result<SecureSession, String> {
    hydrate_session()
}

#[tauri::command]
pub async fn session_store(payload: SecureSessionRecord) -> Result<SecureSession, String> {
    store_session(payload)
}

#[tauri::command]
pub async fn session_clear() -> Result<(), String> {
    clear_session()
}

#[tauri::command]
pub async fn secure_secret_store<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    value: String,
) -> Result<DesktopSecretKey, String> {
    store_secret(&app, key, value)
}

#[tauri::command]
pub async fn secure_secret_get(key: String) -> Result<Option<String>, String> {
    get_secret(key)
}

#[tauri::command]
pub async fn secure_secret_delete<R: Runtime>(
    app: AppHandle<R>,
    key: String,
) -> Result<(), String> {
    delete_secret(&app, key)
}

#[tauri::command]
pub async fn secure_secret_list_keys<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<DesktopSecretKey>, String> {
    list_secret_keys(&app)
}
