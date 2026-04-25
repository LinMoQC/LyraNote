use crate::{
    app::trim_recent_items,
    security::hydrate_session,
    shared::{DesktopRecentItem, RuntimeEnvironmentProbe},
};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, Runtime};

use super::state::DesktopRuntime;

/// Ports reserved by other LyraNote services — the desktop sidecar must never use these.
const RESERVED_PORTS: &[u16] = &[3000, 5432, 5433, 6379, 8000, 9000];

pub fn authenticated_get_json(
    runtime: &DesktopRuntime,
    route: &str,
) -> Result<serde_json::Value, String> {
    let body = authenticated_get(runtime, route)?;
    serde_json::from_str(&body)
        .map_err(|error| format!("failed to parse response for '{route}': {error}"))
}

pub fn fetch_recent_items(runtime: &DesktopRuntime) -> Result<Vec<DesktopRecentItem>, String> {
    let body = authenticated_get(runtime, "/recent-imports")?;
    let payload: serde_json::Value = serde_json::from_str(&body)
        .map_err(|error| format!("failed to parse recent imports: {error}"))?;
    let items = payload
        .get("items")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| {
            let path = item
                .get("path")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            let title = item
                .get("title")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
                .or_else(|| {
                    path.as_ref().and_then(|value| {
                        Path::new(value)
                            .file_name()
                            .and_then(|name| name.to_str())
                            .map(str::to_string)
                    })
                })?;
            Some(DesktopRecentItem {
                kind: "import".to_string(),
                title,
                subtitle: path.clone(),
                path,
                source_id: item
                    .get("source_id")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
                created_at: item
                    .get("imported_at")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            })
        })
        .collect::<Vec<_>>();
    Ok(trim_recent_items(items))
}

pub fn log_excerpt(log_path: &str, max_lines: usize) -> Vec<String> {
    let path = Path::new(log_path);
    let candidate = if path.is_dir() {
        newest_log_file(path)
    } else if path.exists() {
        Some(path.to_path_buf())
    } else {
        None
    };
    let Some(candidate) = candidate else {
        return Vec::new();
    };
    let Ok(raw) = std::fs::read_to_string(candidate) else {
        return Vec::new();
    };
    let mut lines = raw
        .lines()
        .rev()
        .take(max_lines)
        .map(str::to_string)
        .collect::<Vec<_>>();
    lines.reverse();
    lines
}

pub fn post_global_import(runtime: &DesktopRuntime, path: &str) -> Result<(), String> {
    post_desktop_import(runtime, "/sources/global/import-path", path)
}

pub(crate) fn post_watch_import(runtime: &DesktopRuntime, path: &str) -> Result<(), String> {
    post_desktop_import(runtime, "/watch-folders/import", path)
}

pub fn now_iso_string() -> String {
    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{epoch}")
}

pub fn default_log_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../api/logs")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../api/logs"))
}

pub fn resolved_log_dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path()
        .app_log_dir()
        .unwrap_or_else(|_| default_log_dir())
}

pub fn resolved_state_dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path()
        .app_data_dir()
        .map(|path| path.join("desktop"))
        .unwrap_or_else(|_| {
            PathBuf::from(format!(
                "{}/.lyranote/desktop",
                std::env::var("HOME").unwrap_or_default()
            ))
        })
}

pub fn detect_runtime_mode<R: Runtime>(app: &AppHandle<R>) -> String {
    if bundled_sidecar_path(app).is_some() {
        "bundled".to_string()
    } else {
        "source".to_string()
    }
}

pub(crate) fn find_free_port() -> Result<u16, String> {
    for _ in 0..20 {
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|error| format!("failed to allocate port: {error}"))?;
        let port = listener
            .local_addr()
            .map_err(|error| format!("failed to inspect allocated port: {error}"))?
            .port();
        drop(listener);
        if !RESERVED_PORTS.contains(&port) {
            return Ok(port);
        }
    }
    Err(
        "failed to find a free port that does not conflict with other LyraNote services"
            .to_string(),
    )
}

pub(crate) fn sidecar_command<R: Runtime>(
    app: &AppHandle<R>,
    api_dir: &Path,
) -> Result<(Command, String, String), String> {
    if let Some(path) = bundled_sidecar_path(app) {
        if is_real_sidecar_binary(&path) {
            let path_string = path.display().to_string();
            return Ok((Command::new(path), "bundled".to_string(), path_string));
        }
    }
    let venv_python = api_dir.join(".venv/bin/python");
    if venv_python.exists() {
        let path_string = venv_python.display().to_string();
        Ok((Command::new(venv_python), "source".to_string(), path_string))
    } else {
        Ok((
            Command::new("python3"),
            "source".to_string(),
            "python3".to_string(),
        ))
    }
}

pub(crate) fn api_dir() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../api")
        .canonicalize()
        .map_err(|error| format!("failed to locate apps/api: {error}"))
}

pub(crate) fn runtime_environment_probe<R: Runtime>(
    app: &AppHandle<R>,
    runtime_mode: Option<String>,
) -> RuntimeEnvironmentProbe {
    let mode = runtime_mode.unwrap_or_else(|| detect_runtime_mode(app));
    let state_dir = resolved_state_dir(app);
    let log_dir = resolved_log_dir(app);
    RuntimeEnvironmentProbe {
        runtime_mode: mode,
        api_dir: api_dir()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|error| format!("unavailable: {error}")),
        resource_dir: app
            .path()
            .resource_dir()
            .ok()
            .map(|path| path.display().to_string()),
        state_dir: state_dir.display().to_string(),
        log_dir: log_dir.display().to_string(),
        sidecar_path: bundled_sidecar_path(app).map(|path| path.display().to_string()),
    }
}

fn authenticated_get(runtime: &DesktopRuntime, route: &str) -> Result<String, String> {
    let session = hydrate_session()?;
    let token = session
        .access_token
        .ok_or_else(|| "desktop session is unavailable".to_string())?;
    let status = runtime.status();
    if status.api_base_url.is_empty() {
        return Err("desktop runtime API base URL is unavailable".to_string());
    }
    let endpoint = format!("{}{}", status.api_base_url.trim_end_matches('/'), route);
    get_json(&endpoint, &token)
}

fn post_desktop_import(runtime: &DesktopRuntime, route: &str, path: &str) -> Result<(), String> {
    let session = hydrate_session()?;
    let token = session
        .access_token
        .ok_or_else(|| "desktop session is unavailable".to_string())?;
    let status = runtime.status();
    if status.api_base_url.is_empty() {
        return Err("desktop runtime API base URL is unavailable".to_string());
    }
    let endpoint = format!("{}{}", status.api_base_url.trim_end_matches('/'), route);
    let body = serde_json::json!({ "path": path }).to_string();
    let response = post_json(&endpoint, &token, &body)?;
    if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") {
        return Ok(());
    }
    Err(format!(
        "watch import returned unexpected response: {response}"
    ))
}

fn post_json(url: &str, token: &str, body: &str) -> Result<String, String> {
    let without_scheme = url
        .strip_prefix("http://")
        .ok_or_else(|| format!("unsupported URL: {url}"))?;
    let (host_and_port, path) = without_scheme
        .split_once('/')
        .ok_or_else(|| format!("invalid URL: {url}"))?;
    let address = host_and_port
        .parse::<SocketAddr>()
        .map_err(|error| format!("invalid URL '{url}': {error}"))?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))
        .map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    let request = format!(
        "POST /{path} HTTP/1.1\r\nHost: {host_and_port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len(),
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    Ok(response.lines().next().unwrap_or_default().to_string())
}

fn get_json(url: &str, token: &str) -> Result<String, String> {
    let without_scheme = url
        .strip_prefix("http://")
        .ok_or_else(|| format!("unsupported URL: {url}"))?;
    let (host_and_port, path) = without_scheme
        .split_once('/')
        .ok_or_else(|| format!("invalid URL: {url}"))?;
    let address = host_and_port
        .parse::<SocketAddr>()
        .map_err(|error| format!("invalid URL '{url}': {error}"))?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))
        .map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    let request = format!(
        "GET /{path} HTTP/1.1\r\nHost: {host_and_port}\r\nAuthorization: Bearer {token}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    let (head, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "malformed HTTP response".to_string())?;
    if !(head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200")) {
        return Err(format!(
            "request failed: {}",
            head.lines().next().unwrap_or(head)
        ));
    }
    Ok(body.to_string())
}

fn bundled_sidecar_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    if let Ok(binary_path) = std::env::var("LYRANOTE_DESKTOP_BUNDLED_API_PATH") {
        let bundled = PathBuf::from(binary_path);
        if bundled.exists() {
            return Some(bundled);
        }
    }

    let resource_dir = app.path().resource_dir().ok()?;
    let exact = resource_dir.join(bundled_sidecar_name());
    if exact.exists() {
        return Some(exact);
    }

    let with_target = resource_dir.join(format!(
        "{}-{}",
        bundled_sidecar_name(),
        current_target_triple()
    ));
    if with_target.exists() {
        return Some(with_target);
    }

    None
}

fn is_real_sidecar_binary(path: &Path) -> bool {
    const MIN_REAL_BINARY_SIZE: u64 = 4096;
    match std::fs::metadata(path) {
        Ok(meta) => meta.len() >= MIN_REAL_BINARY_SIZE,
        Err(_) => false,
    }
}

fn bundled_sidecar_name() -> &'static str {
    "lyranote-api-desktop"
}

fn current_target_triple() -> &'static str {
    if cfg!(all(target_arch = "aarch64", target_os = "macos")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_arch = "x86_64", target_os = "macos")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_arch = "x86_64", target_os = "linux")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_arch = "aarch64", target_os = "linux")) {
        "aarch64-unknown-linux-gnu"
    } else if cfg!(all(target_arch = "x86_64", target_os = "windows")) {
        "x86_64-pc-windows-msvc"
    } else {
        "unknown-target"
    }
}

fn newest_log_file(path: &Path) -> Option<PathBuf> {
    let mut files = std::fs::read_dir(path)
        .ok()?
        .filter_map(|entry| entry.ok().map(|value| value.path()))
        .filter(|candidate| candidate.is_file())
        .collect::<Vec<_>>();
    files.sort();
    files.pop()
}
