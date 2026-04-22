use crate::shared::DesktopNotification;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn show_notification(app: &AppHandle, notification: DesktopNotification) -> Result<(), String> {
    let mut builder = app
        .notification()
        .builder()
        .title(notification.title)
        .body(notification.body)
        .summary(notification.kind);
    if let Some(route) = notification.route.clone() {
        builder = builder.extra("route", route);
    }
    builder
        .show()
        .map_err(|error| format!("failed to show notification: {error}"))
}
