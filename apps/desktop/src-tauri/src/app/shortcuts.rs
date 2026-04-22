use crate::shared::{DesktopShortcutConfig, DesktopWindowKind};
use serde_json::json;
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use super::windows::open_window;

pub fn normalize_shortcut_accelerator(accelerator: &str) -> String {
    accelerator
        .replace("CmdOrCtrl", "CommandOrControl")
        .replace("CmdOrControl", "CommandOrControl")
}

pub fn apply_global_shortcut<R: Runtime>(
    app: &AppHandle<R>,
    config: &DesktopShortcutConfig,
) -> Result<bool, String> {
    let manager = app.global_shortcut();
    manager
        .unregister_all()
        .map_err(|error| format!("failed to clear global shortcuts: {error}"))?;

    if !config.enabled {
        return Ok(true);
    }

    let normalized = normalize_shortcut_accelerator(&config.accelerator);
    let action = config.action.clone();
    manager
        .on_shortcut(normalized.as_str(), move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let (kind, payload) = shortcut_target(&action);
            let _ = open_window(app, kind, payload);
        })
        .map_err(|error| format!("failed to register global shortcut: {error}"))?;

    Ok(true)
}

fn shortcut_target(action: &str) -> (DesktopWindowKind, Option<serde_json::Value>) {
    match action {
        "quick-chat" => (DesktopWindowKind::Chat, Some(json!({ "initialMessage": "" }))),
        _ => (
            DesktopWindowKind::QuickCapture,
            Some(json!({ "mode": "note" })),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_shortcut_accelerator, shortcut_target};
    use crate::shared::DesktopWindowKind;

    #[test]
    fn normalizes_menu_style_accelerators_for_global_shortcuts() {
        assert_eq!(
            normalize_shortcut_accelerator("CmdOrCtrl+Shift+L"),
            "CommandOrControl+Shift+L"
        );
        assert_eq!(
            normalize_shortcut_accelerator("CmdOrControl+K"),
            "CommandOrControl+K"
        );
    }

    #[test]
    fn maps_shortcut_actions_to_window_routes() {
        let (kind, payload) = shortcut_target("quick-chat");
        assert!(matches!(kind, DesktopWindowKind::Chat));
        assert_eq!(
            payload.expect("chat payload")["initialMessage"],
            serde_json::Value::String(String::new())
        );

        let (kind, payload) = shortcut_target("quick-capture");
        assert!(matches!(kind, DesktopWindowKind::QuickCapture));
        assert_eq!(
            payload.expect("capture payload")["mode"],
            serde_json::Value::String("note".into())
        );
    }
}
