use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DesktopRuntimeState {
    Starting,
    Ready,
    Degraded,
    Stopped,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeStatus {
    pub state: DesktopRuntimeState,
    pub mode: String,
    pub health_url: String,
    pub api_base_url: String,
    pub pid: Option<u32>,
    pub version: Option<String>,
    pub last_error: Option<String>,
    pub last_exit_reason: Option<String>,
    pub last_healthcheck_at: Option<String>,
    pub last_heartbeat_at: Option<String>,
    pub log_path: String,
    pub state_dir: String,
    pub sidecar_path: Option<String>,
    pub restart_count: u32,
    pub watcher_count: usize,
    pub watchers_paused: bool,
    pub last_restart_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SelectedPath {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub mime_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopNotification {
    pub kind: String,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub route: Option<DesktopNotificationRoute>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchFolderRegistration {
    pub id: String,
    pub path: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub payload: Value,
    pub occurred_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureSessionRecord {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub user: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SecureSession {
    pub has_session: bool,
    pub access_token: Option<String>,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub user: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DesktopWindowKind {
    Main,
    QuickCapture,
    Chat,
    SourceDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopShortcutConfig {
    pub accelerator: String,
    pub action: String,
    pub enabled: bool,
    pub supported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopNotificationRoute {
    pub kind: String,
    #[serde(default)]
    pub section: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub source_id: Option<String>,
    #[serde(default)]
    pub window: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopRecentItem {
    pub kind: String,
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub source_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopDiagnosticsBundleMeta {
    pub path: String,
    pub generated_at: String,
    pub log_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WatcherDiagnostics {
    pub watcher_count: usize,
    pub paused: bool,
    pub watched_paths: Vec<String>,
    pub pending_paths_count: usize,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeEnvironmentProbe {
    pub runtime_mode: String,
    pub api_dir: String,
    pub resource_dir: Option<String>,
    pub state_dir: String,
    pub log_dir: String,
    pub sidecar_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopShellEvent {
    pub shortcut: DesktopShortcutConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopSecretKey {
    pub key: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopFileProbe {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size_bytes: Option<u64>,
    pub extension: Option<String>,
    pub mime_hint: Option<String>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub pdf_page_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopHashResult {
    pub path: String,
    pub algorithm: String,
    pub digest: String,
    pub bytes_processed: u64,
}

impl Default for RuntimeStatus {
    fn default() -> Self {
        Self {
            state: DesktopRuntimeState::Stopped,
            mode: "source".to_string(),
            health_url: String::new(),
            api_base_url: String::new(),
            pid: None,
            version: None,
            last_error: None,
            last_exit_reason: None,
            last_healthcheck_at: None,
            last_heartbeat_at: None,
            log_path: String::new(),
            state_dir: String::new(),
            sidecar_path: None,
            restart_count: 0,
            watcher_count: 0,
            watchers_paused: false,
            last_restart_at: None,
        }
    }
}

impl Default for DesktopShortcutConfig {
    fn default() -> Self {
        Self {
            accelerator: "CmdOrCtrl+Shift+L".to_string(),
            action: "quick-capture".to_string(),
            enabled: true,
            supported: false,
        }
    }
}

impl DesktopWindowKind {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::QuickCapture => "quick-capture",
            Self::Chat => "chat",
            Self::SourceDetail => "source-detail",
        }
    }

    pub fn title(&self) -> &'static str {
        match self {
            Self::Main => "LyraNote",
            Self::QuickCapture => "Quick Capture",
            Self::Chat => "LyraNote Chat",
            Self::SourceDetail => "Source Detail",
        }
    }
}
