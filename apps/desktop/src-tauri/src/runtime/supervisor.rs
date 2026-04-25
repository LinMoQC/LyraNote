use crate::shared::{DesktopRuntimeState, RuntimeStatus};
use std::{
    io::{BufRead, BufReader, Read},
    process::Stdio,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Runtime};

use super::{
    health::{map_sidecar_event_name, parse_sidecar_event, ping_health},
    sidecar::{
        api_dir, detect_runtime_mode, find_free_port, now_iso_string, resolved_log_dir,
        resolved_state_dir, sidecar_command,
    },
    state::DesktopRuntime,
};

const RUNTIME_EVENT_NAME: &str = "runtime://state";
const MAX_AUTO_RESTART_ATTEMPTS: u32 = 1;
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);
const HEARTBEAT_FAILURE_THRESHOLD: u32 = 2;

impl DesktopRuntime {
    pub fn ensure_started<R: Runtime>(&self, app: &AppHandle<R>) -> Result<RuntimeStatus, String> {
        {
            let inner = self
                .inner
                .lock()
                .map_err(|_| "runtime mutex poisoned".to_string())?;
            if matches!(
                inner.status.state,
                DesktopRuntimeState::Starting | DesktopRuntimeState::Ready
            ) {
                return Ok(inner.status.clone());
            }
        }

        self.start(app.clone(), false)?;
        Ok(self.status())
    }

    pub fn restart<R: Runtime>(&self, app: &AppHandle<R>) -> Result<RuntimeStatus, String> {
        self.stop()?;
        self.start(app.clone(), true)?;
        Ok(self.status())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "runtime mutex poisoned".to_string())?;
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        inner.auto_restart_attempts = 0;
        inner.status = RuntimeStatus {
            state: DesktopRuntimeState::Stopped,
            pid: None,
            last_error: None,
            version: None,
            last_healthcheck_at: None,
            last_heartbeat_at: None,
            ..inner.status.clone()
        };
        Ok(())
    }

    pub fn set_watcher_count<R: Runtime>(&self, app: &AppHandle<R>, watcher_count: usize) {
        let mut status = self.status();
        status.watcher_count = watcher_count;
        self.update_status(app, status);
    }

    pub fn set_watchers_paused<R: Runtime>(&self, app: &AppHandle<R>, watchers_paused: bool) {
        let mut status = self.status();
        status.watchers_paused = watchers_paused;
        self.update_status(app, status);
    }

    pub(crate) fn start<R: Runtime>(
        &self,
        app: AppHandle<R>,
        is_restart: bool,
    ) -> Result<(), String> {
        let port = find_free_port()?;
        let health_url = format!("http://127.0.0.1:{port}/health");
        let api_base_url = format!("http://127.0.0.1:{port}/api/v1");
        let runtime_mode = detect_runtime_mode(&app);
        let log_path = resolved_log_dir(&app).display().to_string();
        let state_dir = resolved_state_dir(&app).display().to_string();

        let mut next_status = self.status();
        next_status.state = DesktopRuntimeState::Starting;
        next_status.mode = runtime_mode.clone();
        next_status.health_url = health_url.clone();
        next_status.api_base_url = api_base_url.clone();
        next_status.pid = None;
        next_status.version = None;
        next_status.last_error = None;
        next_status.last_healthcheck_at = None;
        next_status.last_heartbeat_at = None;
        next_status.log_path = log_path.clone();
        next_status.state_dir = state_dir.clone();
        self.update_status(&app, next_status);

        let api_dir = api_dir()?;
        let (mut command, mode, sidecar_path) = sidecar_command(&app, &api_dir)?;
        if mode == "bundled" {
            command
                .arg("--host")
                .arg("127.0.0.1")
                .arg("--port")
                .arg(port.to_string());
        } else {
            command
                .args([
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    &port.to_string(),
                ])
                .current_dir(&api_dir)
                .env("PYTHONPATH", ".");
        }
        command
            .env("RUNTIME_PROFILE", "desktop")
            .env("DESKTOP_STDOUT_EVENTS", "true")
            .env("DESKTOP_STATE_DIR_OVERRIDE", &state_dir)
            .env("LOGS_DIR_OVERRIDE", &log_path)
            .env("MEMORY_MODE", "desktop")
            .env("MONITORING_ENABLED", "false")
            .env(
                "CORS_ORIGINS",
                "http://tauri.localhost,tauri://localhost,http://localhost:1420,http://127.0.0.1:1420",
            )
            .env("FRONTEND_URL", "http://tauri.localhost")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command
            .spawn()
            .map_err(|error| format!("failed to spawn sidecar: {error}"))?;
        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        {
            let mut inner = self
                .inner
                .lock()
                .map_err(|_| "runtime mutex poisoned".to_string())?;
            inner.status.pid = Some(pid);
            inner.status.sidecar_path = Some(sidecar_path);
            if is_restart {
                inner.status.restart_count += 1;
                inner.status.last_restart_at = Some(now_iso_string());
            }
            inner.child = Some(child);
        }
        self.emit_current_status(&app);

        if let Some(stdout) = stdout {
            spawn_output_reader(self.clone(), app.clone(), stdout, false);
        }
        if let Some(stderr) = stderr {
            spawn_output_reader(self.clone(), app.clone(), stderr, true);
        }

        spawn_health_monitor(self.clone(), app.clone(), health_url.clone());
        spawn_runtime_heartbeat(self.clone(), app.clone(), health_url.clone());
        spawn_exit_monitor(self.clone(), app.clone());

        Ok(())
    }

    fn emit_current_status<R: Runtime>(&self, app: &AppHandle<R>) {
        let _ = app.emit(RUNTIME_EVENT_NAME, self.status());
    }

    fn update_status<R: Runtime>(&self, app: &AppHandle<R>, status: RuntimeStatus) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.status = status;
        }
        self.emit_current_status(app);
    }

    fn set_ready<R: Runtime>(&self, app: &AppHandle<R>, version: Option<String>) {
        let mut status = self.status();
        status.state = DesktopRuntimeState::Ready;
        status.version = version.or(status.version);
        status.last_error = None;
        status.last_healthcheck_at = Some(now_iso_string());
        status.last_heartbeat_at = Some(now_iso_string());
        self.update_status(app, status);
        if let Ok(mut inner) = self.inner.lock() {
            inner.auto_restart_attempts = 0;
        }
    }

    fn set_degraded<R: Runtime>(&self, app: &AppHandle<R>, message: String) {
        let mut status = self.status();
        status.state = DesktopRuntimeState::Degraded;
        status.last_error = Some(message);
        status.last_healthcheck_at = Some(now_iso_string());
        self.update_status(app, status);
    }

    fn record_heartbeat<R: Runtime>(&self, app: &AppHandle<R>) {
        let mut status = self.status();
        status.last_healthcheck_at = Some(now_iso_string());
        status.last_heartbeat_at = status.last_healthcheck_at.clone();
        self.update_status(app, status);
    }

    fn record_exit_reason<R: Runtime>(&self, app: &AppHandle<R>, reason: String) {
        let mut status = self.status();
        status.last_exit_reason = Some(reason);
        self.update_status(app, status);
    }

    fn capture_version<R: Runtime>(&self, app: &AppHandle<R>, version: Option<String>) {
        if version.is_none() {
            return;
        }
        let mut status = self.status();
        status.version = version;
        self.update_status(app, status);
    }
}

fn spawn_output_reader<T: Runtime, R: Read + Send + 'static>(
    runtime: DesktopRuntime,
    app: AppHandle<T>,
    reader: R,
    is_stderr: bool,
) {
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
                    let version = event
                        .payload
                        .get("version")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_string);
                    runtime.capture_version(&app, version);
                }
                if let Some(event_name) = map_sidecar_event_name(&event.event_type) {
                    let _ = app.emit(event_name, &event);
                }
            }
        }
    });
}

fn spawn_health_monitor<R: Runtime>(
    runtime: DesktopRuntime,
    app: AppHandle<R>,
    health_url: String,
) {
    thread::spawn(move || {
        let started_at = Instant::now();
        while started_at.elapsed() < Duration::from_secs(25) {
            if ping_health(&health_url).is_ok() {
                runtime.set_ready(&app, None);
                return;
            }
            thread::sleep(Duration::from_millis(400));
        }
        runtime.set_degraded(
            &app,
            "Timed out waiting for desktop sidecar health check.".to_string(),
        );
    });
}

fn spawn_runtime_heartbeat<R: Runtime>(
    runtime: DesktopRuntime,
    app: AppHandle<R>,
    health_url: String,
) {
    thread::spawn(move || {
        let mut failure_count = 0_u32;
        loop {
            thread::sleep(HEARTBEAT_INTERVAL);
            let status = runtime.status();
            if status.pid.is_none() || status.health_url != health_url {
                return;
            }

            match ping_health(&health_url) {
                Ok(_) => {
                    failure_count = 0;
                    runtime.record_heartbeat(&app);
                }
                Err(error) => {
                    failure_count += 1;
                    if failure_count >= HEARTBEAT_FAILURE_THRESHOLD {
                        runtime.set_degraded(
                            &app,
                            format!("Desktop runtime heartbeat failed: {error}"),
                        );
                    }
                }
            }
        }
    });
}

fn spawn_exit_monitor<R: Runtime>(runtime: DesktopRuntime, app: AppHandle<R>) {
    thread::spawn(move || loop {
        let mut exit_message = None;
        let mut restart_delay = None;
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
                    if inner.auto_restart_attempts < MAX_AUTO_RESTART_ATTEMPTS {
                        inner.auto_restart_attempts += 1;
                        restart_delay = Some(compute_restart_backoff(inner.auto_restart_attempts));
                    }
                }
                Ok(None) => {}
                Err(error) => {
                    exit_message = Some(format!("Failed to monitor desktop sidecar: {error}"));
                    inner.child = None;
                }
            }
        }

        if let Some(message) = exit_message {
            runtime.record_exit_reason(&app, message.clone());
            if let Some(delay) = restart_delay {
                runtime.set_degraded(
                    &app,
                    format!(
                        "{message}. LyraNote 将在 {:.1}s 后尝试恢复。",
                        delay.as_secs_f32()
                    ),
                );
                thread::sleep(delay);
                if let Err(error) = runtime.start(app.clone(), true) {
                    runtime.record_exit_reason(&app, error.clone());
                    runtime
                        .set_degraded(&app, format!("Desktop runtime failed to restart: {error}"));
                }
            } else {
                runtime.set_degraded(&app, message);
            }
            return;
        }

        thread::sleep(Duration::from_millis(800));
    });
}

fn compute_restart_backoff(attempt: u32) -> Duration {
    let capped_attempt = attempt.min(4);
    let base_ms = 1_000_u64;
    Duration::from_millis(
        base_ms.saturating_mul(2_u64.saturating_pow(capped_attempt.saturating_sub(1))),
    )
}

#[cfg(test)]
mod tests {
    use super::compute_restart_backoff;
    use std::time::Duration;

    #[test]
    fn computes_exponential_restart_backoff() {
        assert_eq!(compute_restart_backoff(1), Duration::from_secs(1));
        assert_eq!(compute_restart_backoff(2), Duration::from_secs(2));
        assert_eq!(compute_restart_backoff(3), Duration::from_secs(4));
        assert_eq!(compute_restart_backoff(10), Duration::from_secs(8));
    }
}
