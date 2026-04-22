use crate::{
    app::{build_app_menu, emit_shell_event, open_window, DesktopShell},
    runtime::{post_global_import, DesktopRuntime, WatchManager},
    shared::DesktopWindowKind,
};
use tauri::{App, AppHandle, Manager, RunEvent, Runtime};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

pub fn setup_app<R: Runtime>(app: &mut App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let window = app.get_webview_window("main").unwrap();
    let shell = app.state::<DesktopShell>();
    let runtime = app.state::<DesktopRuntime>();
    let watch_manager = app.state::<WatchManager>();
    shell.hydrate(&app.handle());
    watch_manager.hydrate(&app.handle(), runtime.inner());

    #[cfg(target_os = "macos")]
    apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, Some(12.0))
        .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

    let _ = runtime.ensure_started(&app.handle());
    if let Ok(menu) = build_app_menu(&app.handle(), shell.inner(), watch_manager.inner()) {
        let _ = app.set_menu(menu);
    }
    emit_shell_event(&app.handle(), shell.inner());

    Ok(())
}

pub fn handle_run_event<R: Runtime>(app: &AppHandle<R>, event: RunEvent) {
    match event {
        RunEvent::Exit => {
            let runtime = app.state::<DesktopRuntime>();
            let _ = runtime.stop();
        }
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            let runtime = app.state::<DesktopRuntime>();
            for url in urls {
                if url.scheme() != "file" {
                    continue;
                }
                if let Ok(path) = url.to_file_path() {
                    let _ = post_global_import(runtime.inner(), &path.display().to_string());
                    let _ = open_window(
                        app,
                        DesktopWindowKind::Main,
                        Some(serde_json::json!({
                            "section": "knowledge",
                            "openedPath": path.display().to_string(),
                        })),
                    );
                }
            }
        }
        _ => {}
    }
}
