pub mod bootstrap;
pub mod events;
pub mod menu;
pub mod shortcuts;
pub mod tray;
pub mod windows;

pub use bootstrap::{handle_run_event, setup_app};
pub use events::{build_diagnostics_bundle, emit_shell_event, trim_recent_items, DesktopShell};
pub use menu::{build_app_menu, handle_menu_event};
pub use windows::{focus_window, open_window};
