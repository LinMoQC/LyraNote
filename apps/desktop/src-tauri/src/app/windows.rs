use crate::shared::DesktopWindowKind;
use serde_json::Value;
use std::{thread, time::Duration};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

pub const WINDOW_ROUTE_EVENT_NAME: &str = "desktop://route";

pub fn open_window<R: Runtime>(
    app: &AppHandle<R>,
    kind: DesktopWindowKind,
    payload: Option<Value>,
) -> Result<(), String> {
    let label = kind.label();
    if let Some(window) = app.get_webview_window(label) {
        focus_and_route(&window, payload)?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::default())
        .title(kind.title())
        .inner_size(window_size(&kind).0, window_size(&kind).1)
        .min_inner_size(window_min_size(&kind).0, window_min_size(&kind).1)
        .decorations(false)
        .transparent(true)
        .center()
        .resizable(true)
        .visible(true)
        .always_on_top(matches!(kind, DesktopWindowKind::QuickCapture))
        .build()
        .map_err(|error| format!("failed to open window '{}': {error}", label))?;

    #[cfg(target_os = "macos")]
    apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, Some(12.0))
        .map_err(|error| error.to_string())?;

    focus_and_route(&window, payload)
}

pub fn focus_window<R: Runtime>(app: &AppHandle<R>, label: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window '{label}' is not available"))?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

fn focus_and_route<R: Runtime>(
    window: &WebviewWindow<R>,
    payload: Option<Value>,
) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    if let Some(payload) = payload {
        let target = window.label().to_string();
        let app = window.app_handle().clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(250));
            let _ = app.emit_to(target, WINDOW_ROUTE_EVENT_NAME, payload);
        });
    }
    Ok(())
}

fn window_size(kind: &DesktopWindowKind) -> (f64, f64) {
    match kind {
        DesktopWindowKind::Main => (1280.0, 800.0),
        DesktopWindowKind::QuickCapture => (560.0, 420.0),
        DesktopWindowKind::Chat => (1024.0, 760.0),
        DesktopWindowKind::SourceDetail => (980.0, 760.0),
    }
}

fn window_min_size(kind: &DesktopWindowKind) -> (f64, f64) {
    match kind {
        DesktopWindowKind::Main => (900.0, 600.0),
        DesktopWindowKind::QuickCapture => (460.0, 320.0),
        DesktopWindowKind::Chat => (720.0, 520.0),
        DesktopWindowKind::SourceDetail => (720.0, 520.0),
    }
}
