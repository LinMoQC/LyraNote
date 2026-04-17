use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

const RUNTIME_EVENT_NAME: &str = "runtime://state";
const RUNTIME_RAW_EVENT_NAME: &str = "runtime://event";
const JOBS_EVENT_NAME: &str = "jobs://progress";
const SYNC_EVENT_NAME: &str = "sync://state";
const IMPORT_EVENT_NAME: &str = "import://result";

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
    pub last_healthcheck_at: Option<String>,
    pub log_path: String,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub payload: Value,
    pub occurred_at: String,
}

#[derive(Clone)]
pub struct DesktopRuntime {
    inner: Arc<Mutex<RuntimeInner>>,
}

struct RuntimeInner {
    child: Option<Child>,
    status: RuntimeStatus,
    restart_attempted: bool,
}

impl Default for DesktopRuntime {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(RuntimeInner {
                child: None,
                status: RuntimeStatus::default(),
                restart_attempted: false,
            })),
        }
    }
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
            last_healthcheck_at: None,
            log_path: default_log_dir().display().to_string(),
        }
    }
}

impl DesktopRuntime {
    pub fn status(&self) -> RuntimeStatus {
        self.inner.lock().expect("runtime mutex poisoned").status.clone()
    }

    pub fn ensure_started(&self, app: &AppHandle) -> Result<RuntimeStatus, String> {
        {
            let inner = self.inner.lock().map_err(|_| "runtime mutex poisoned".to_string())?;
            if matches!(inner.status.state, DesktopRuntimeState::Starting | DesktopRuntimeState::Ready) {
                return Ok(inner.status.clone());
            }
        }

        self.start(app.clone(), false)?;
        Ok(self.status())
    }

    pub fn restart(&self, app: &AppHandle) -> Result<RuntimeStatus, String> {
        self.stop()?;
        self.start(app.clone(), true)?;
        Ok(self.status())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|_| "runtime mutex poisoned".to_string())?;
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        inner.restart_attempted = false;
        inner.status = RuntimeStatus {
            state: DesktopRuntimeState::Stopped,
            pid: None,
            last_error: None,
            version: None,
            last_healthcheck_at: None,
            ..inner.status.clone()
        };
        Ok(())
    }

    fn start(&self, app: AppHandle, is_restart: bool) -> Result<(), String> {
        let port = find_free_port()?;
        let health_url = format!("http://127.0.0.1:{port}/health");
        let api_base_url = format!("http://127.0.0.1:{port}/api/v1");
        let log_path = default_log_dir().display().to_string();

        self.update_status(
            &app,
            RuntimeStatus {
                state: DesktopRuntimeState::Starting,
                mode: runtime_mode(),
                health_url: health_url.clone(),
                api_base_url: api_base_url.clone(),
                pid: None,
                version: None,
                last_error: None,
                last_healthcheck_at: None,
                log_path,
            },
        );

        let api_dir = api_dir()?;
        let mut command = sidecar_command(&api_dir);
        command
            .args(["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", &port.to_string()])
            .current_dir(&api_dir)
            .env("PYTHONPATH", ".")
            .env("RUNTIME_PROFILE", "desktop")
            .env("DESKTOP_STDOUT_EVENTS", "true")
            .env("MEMORY_MODE", "desktop")
            .env("MONITORING_ENABLED", "false")
            .env(
                "CORS_ORIGINS",
                "http://tauri.localhost,tauri://localhost,http://localhost:1420,http://127.0.0.1:1420",
            )
            .env("FRONTEND_URL", "http://tauri.localhost")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command.spawn().map_err(|error| format!("failed to spawn sidecar: {error}"))?;
        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        {
            let mut inner = self.inner.lock().map_err(|_| "runtime mutex poisoned".to_string())?;
            inner.restart_attempted = is_restart;
            inner.status.pid = Some(pid);
            inner.child = Some(child);
        }
        self.emit_current_status(&app);

        if let Some(stdout) = stdout {
            spawn_output_reader(self.clone(), app.clone(), stdout, false);
        }
        if let Some(stderr) = stderr {
            spawn_output_reader(self.clone(), app.clone(), stderr, true);
        }

        spawn_health_monitor(self.clone(), app.clone(), health_url, api_base_url);
        spawn_exit_monitor(self.clone(), app.clone());

        Ok(())
    }

    fn emit_current_status(&self, app: &AppHandle) {
        let _ = app.emit(RUNTIME_EVENT_NAME, self.status());
    }

    fn update_status(&self, app: &AppHandle, status: RuntimeStatus) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.status = status;
        }
        self.emit_current_status(app);
    }

    fn set_ready(&self, app: &AppHandle, version: Option<String>) {
        let mut status = self.status();
        status.state = DesktopRuntimeState::Ready;
        status.version = version.or(status.version);
        status.last_error = None;
        status.last_healthcheck_at = Some(now_iso_string());
        self.update_status(app, status);
    }

    fn set_degraded(&self, app: &AppHandle, message: String) {
        let mut status = self.status();
        status.state = DesktopRuntimeState::Degraded;
        status.last_error = Some(message);
        status.last_healthcheck_at = Some(now_iso_string());
        self.update_status(app, status);
    }

    fn capture_version(&self, app: &AppHandle, version: Option<String>) {
        if version.is_none() {
            return;
        }
        let mut status = self.status();
        status.version = version;
        self.update_status(app, status);
    }
}

pub fn parse_sidecar_event(line: &str) -> Option<SidecarEvent> {
    serde_json::from_str::<SidecarEvent>(line).ok()
}

pub fn dialog_pick_sources() -> Result<Vec<SelectedPath>, String> {
    let script = r#"set chosenFiles to choose file with multiple selections allowed
set output to ""
repeat with aFile in chosenFiles
  set output to output & POSIX path of aFile & linefeed
end repeat
return output"#;

    let output = Command::new("osascript")
        .args(["-e", script])
        .output()
        .map_err(|error| format!("failed to open file picker: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("User canceled") {
            return Ok(Vec::new());
        }
        return Err(stderr.trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| path_to_selected(line, false))
        .collect())
}

pub fn reveal_path(path: &str) -> Result<(), String> {
    let output = Command::new("open")
        .args(["-R", path])
        .output()
        .map_err(|error| format!("failed to reveal path: {error}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub fn show_notification(notification: DesktopNotification) -> Result<(), String> {
    let script = format!(
        "display notification \"{}\" with title \"{}\" subtitle \"{}\"",
        escape_applescript(&notification.body),
        escape_applescript(&notification.title),
        escape_applescript(&notification.kind),
    );
    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|error| format!("failed to show notification: {error}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn spawn_output_reader<R: Read + Send + 'static>(runtime: DesktopRuntime, app: AppHandle, reader: R, is_stderr: bool) {
    thread::spawn(move || {
        let prefix = if is_stderr { "stderr" } else { "stdout" };
        for line_result in BufReader::new(reader).lines() {
            let Ok(line) = line_result else { continue };
            if line.trim().is_empty() {
                continue;
            }
            println!("[desktop-runtime:{prefix}] {line}");
            if let Some(event) = parse_sidecar_event(&line) {
                if event.event_type == "runtime.ready" {
                    let version = event.payload.get("version").and_then(Value::as_str).map(str::to_string);
                    runtime.capture_version(&app, version);
                }
                if let Some(event_name) = map_sidecar_event_name(&event.event_type) {
                    let _ = app.emit(event_name, &event);
                }
            }
        }
    });
}

fn spawn_health_monitor(runtime: DesktopRuntime, app: AppHandle, health_url: String, _api_base_url: String) {
    thread::spawn(move || {
        let started_at = Instant::now();
        while started_at.elapsed() < Duration::from_secs(25) {
            if ping_health(&health_url).is_ok() {
                runtime.set_ready(&app, None);
                return;
            }
            thread::sleep(Duration::from_millis(400));
        }
        runtime.set_degraded(&app, "Timed out waiting for desktop sidecar health check.".to_string());
    });
}

fn spawn_exit_monitor(runtime: DesktopRuntime, app: AppHandle) {
    thread::spawn(move || loop {
        let mut should_restart = false;
        let mut exit_message = None;
        {
            let mut inner = match runtime.inner.lock() {
                Ok(inner) => inner,
                Err(_) => return,
            };
            let Some(child) = inner.child.as_mut() else {
                return;
            };
            match child.try_wait() {
                Ok(Some(status)) => {
                    exit_message = Some(format!("Desktop sidecar exited with status {status}"));
                    inner.child = None;
                    should_restart = !inner.restart_attempted;
                    inner.restart_attempted = true;
                }
                Ok(None) => {}
                Err(error) => {
                    exit_message = Some(format!("Failed to monitor desktop sidecar: {error}"));
                    inner.child = None;
                }
            }
        }

        if let Some(message) = exit_message {
            runtime.set_degraded(&app, message);
            if should_restart {
                let _ = runtime.start(app.clone(), true);
            }
            return;
        }

        thread::sleep(Duration::from_millis(800));
    });
}

fn ping_health(url: &str) -> Result<(), String> {
    let address = url
        .trim_start_matches("http://")
        .trim_end_matches("/health")
        .parse::<SocketAddr>()
        .map_err(|error| format!("invalid health url '{url}': {error}"))?;

    let mut stream =
        TcpStream::connect_timeout(&address, Duration::from_secs(1)).map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(1)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(1)))
        .map_err(|error| error.to_string())?;
    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .map_err(|error| error.to_string())?;

    let mut response = String::new();
    stream.read_to_string(&mut response).map_err(|error| error.to_string())?;
    if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") {
        Ok(())
    } else {
        Err("health check returned non-200".to_string())
    }
}

fn find_free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| format!("failed to allocate port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("failed to inspect allocated port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn sidecar_command(api_dir: &Path) -> Command {
    let venv_python = api_dir.join(".venv/bin/python");
    if venv_python.exists() {
        Command::new(venv_python)
    } else {
        Command::new("python3")
    }
}

fn api_dir() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../api")
        .canonicalize()
        .map_err(|error| format!("failed to locate apps/api: {error}"))
}

fn default_log_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../api/logs")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../api/logs"))
}

fn runtime_mode() -> String {
    if std::env::var("LYRANOTE_DESKTOP_BUNDLED_API_PATH").is_ok() {
        "bundled".to_string()
    } else {
        "source".to_string()
    }
}

fn now_iso_string() -> String {
    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{epoch}")
}

fn escape_applescript(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn path_to_selected(path: &str, is_dir: bool) -> SelectedPath {
    let path_buf = PathBuf::from(path);
    let mime_hint = path_buf
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    SelectedPath {
        path: path.to_string(),
        name: path_buf
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(path)
            .to_string(),
        is_dir,
        mime_hint,
    }
}

fn map_sidecar_event_name(event_type: &str) -> Option<&'static str> {
    match event_type {
        "runtime.ready" | "runtime.state" => Some(RUNTIME_RAW_EVENT_NAME),
        "job.progress" => Some(JOBS_EVENT_NAME),
        "sync.changed" => Some(SYNC_EVENT_NAME),
        "import.failed" | "import.result" => Some(IMPORT_EVENT_NAME),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{map_sidecar_event_name, parse_sidecar_event};

    #[test]
    fn parses_sidecar_json_lines() {
        let line = r#"{"type":"runtime.ready","payload":{"version":"0.1.0"},"occurred_at":"2026-04-17T12:00:00Z"}"#;
        let parsed = parse_sidecar_event(line).expect("event should parse");
        assert_eq!(parsed.event_type, "runtime.ready");
        assert_eq!(
            parsed.payload.get("version").and_then(|value| value.as_str()),
            Some("0.1.0")
        );
    }

    #[test]
    fn maps_supported_event_names() {
        assert_eq!(map_sidecar_event_name("runtime.ready"), Some("runtime://event"));
        assert_eq!(map_sidecar_event_name("job.progress"), Some("jobs://progress"));
        assert_eq!(map_sidecar_event_name("sync.changed"), Some("sync://state"));
        assert_eq!(map_sidecar_event_name("import.failed"), Some("import://result"));
        assert_eq!(map_sidecar_event_name("unknown"), None);
    }
}
