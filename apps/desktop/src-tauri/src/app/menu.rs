use crate::{
    app::{events::DesktopShell, windows::open_window},
    platform::reveal_path,
    runtime::{DesktopRuntime, WatchManager},
    shared::DesktopWindowKind,
};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Runtime,
};

const MENU_NEW_NOTE: &str = "desktop.new-note";
const MENU_QUICK_CAPTURE: &str = "desktop.quick-capture";
const MENU_QUICK_CHAT: &str = "desktop.quick-chat";
const MENU_OPEN_KNOWLEDGE: &str = "desktop.open-knowledge";
const MENU_OPEN_RECENT_IMPORTS: &str = "desktop.open-recent-imports";
const MENU_TOGGLE_WATCHERS: &str = "desktop.toggle-watchers";
const MENU_RESTART_RUNTIME: &str = "desktop.restart-runtime";
const MENU_OPEN_LOGS: &str = "desktop.open-logs";

pub fn build_app_menu<R: Runtime>(
    app: &AppHandle<R>,
    shell: &DesktopShell,
    watch_manager: &WatchManager,
) -> Result<Menu<R>, String> {
    let shortcut = shell.shortcut_config();
    let quick_capture_accelerator = shortcut.enabled.then_some(shortcut.accelerator.as_str());
    let watchers_toggle_label = if watch_manager.is_paused() {
        "恢复监听目录"
    } else {
        "暂停监听目录"
    };
    let app_menu = Submenu::with_items(
        app,
        "LyraNote",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("关于 LyraNote"), None)
                .map_err(|error| error.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?,
            &MenuItem::with_id(
                app,
                MENU_QUICK_CAPTURE,
                "Quick Capture",
                true,
                quick_capture_accelerator,
            )
            .map_err(|error| error.to_string())?,
            &MenuItem::with_id(
                app,
                MENU_QUICK_CHAT,
                "快速提问",
                true,
                Some("CmdOrCtrl+Shift+K"),
            )
            .map_err(|error| error.to_string())?,
            &MenuItem::with_id(
                app,
                MENU_NEW_NOTE,
                "新建收件箱笔记",
                true,
                Some("CmdOrCtrl+Shift+N"),
            )
            .map_err(|error| error.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::hide(app, None).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::hide_others(app, None).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::show_all(app, None).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::quit(app, None).map_err(|error| error.to_string())?,
        ],
    )
    .map_err(|error| error.to_string())?;

    let edit_menu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &PredefinedMenuItem::undo(app, None).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::redo(app, None).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::cut(app, None).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::copy(app, None).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::paste(app, None).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::select_all(app, None).map_err(|error| error.to_string())?,
        ],
    )
    .map_err(|error| error.to_string())?;

    let workspace_menu = Submenu::with_items(
        app,
        "工作台",
        true,
        &[
            &MenuItem::with_id(
                app,
                MENU_OPEN_KNOWLEDGE,
                "打开知识库",
                true,
                Some("CmdOrCtrl+3"),
            )
            .map_err(|error| error.to_string())?,
            &MenuItem::with_id(
                app,
                MENU_OPEN_RECENT_IMPORTS,
                "查看最近导入文件",
                true,
                None::<&str>,
            )
            .map_err(|error| error.to_string())?,
            &MenuItem::with_id(
                app,
                MENU_TOGGLE_WATCHERS,
                watchers_toggle_label,
                true,
                None::<&str>,
            )
            .map_err(|error| error.to_string())?,
            &MenuItem::with_id(
                app,
                MENU_RESTART_RUNTIME,
                "重启 Runtime",
                true,
                None::<&str>,
            )
            .map_err(|error| error.to_string())?,
            &MenuItem::with_id(app, MENU_OPEN_LOGS, "打开日志目录", true, None::<&str>)
                .map_err(|error| error.to_string())?,
        ],
    )
    .map_err(|error| error.to_string())?;

    let window_menu = Submenu::with_items(
        app,
        "窗口",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::maximize(app, None).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?,
            &PredefinedMenuItem::close_window(app, None).map_err(|error| error.to_string())?,
        ],
    )
    .map_err(|error| error.to_string())?;

    Menu::with_items(app, &[&app_menu, &edit_menu, &workspace_menu, &window_menu])
        .map_err(|error| error.to_string())
}

pub fn handle_menu_event<R: Runtime>(
    app: &AppHandle<R>,
    event: MenuEvent,
    runtime: &DesktopRuntime,
    shell: &DesktopShell,
    watch_manager: &WatchManager,
) {
    if event.id() == MENU_QUICK_CAPTURE {
        let _ = open_window(
            app,
            DesktopWindowKind::QuickCapture,
            Some(serde_json::json!({ "mode": "note" })),
        );
    } else if event.id() == MENU_QUICK_CHAT {
        let _ = open_window(
            app,
            DesktopWindowKind::Chat,
            Some(serde_json::json!({ "initialMessage": "" })),
        );
    } else if event.id() == MENU_NEW_NOTE {
        let _ = open_window(
            app,
            DesktopWindowKind::QuickCapture,
            Some(serde_json::json!({ "mode": "note", "focus": true })),
        );
    } else if event.id() == MENU_OPEN_KNOWLEDGE {
        let _ = open_window(
            app,
            DesktopWindowKind::Main,
            Some(serde_json::json!({ "section": "knowledge" })),
        );
    } else if event.id() == MENU_OPEN_RECENT_IMPORTS {
        let _ = open_window(
            app,
            DesktopWindowKind::Main,
            Some(serde_json::json!({ "section": "knowledge", "showRecentImports": true })),
        );
    } else if event.id() == MENU_TOGGLE_WATCHERS {
        let _ = watch_manager.toggle_paused(app, runtime.clone());
        if let Ok(menu) = build_app_menu(app, shell, watch_manager) {
            let _ = app.set_menu(menu);
        }
    } else if event.id() == MENU_RESTART_RUNTIME {
        let _ = runtime.restart(app);
    } else if event.id() == MENU_OPEN_LOGS {
        let log_path = runtime.status().log_path;
        if !log_path.is_empty() {
            let _ = reveal_path(&log_path);
        }
    } else if event.id() == "quit" {
        app.exit(0);
    }
}
