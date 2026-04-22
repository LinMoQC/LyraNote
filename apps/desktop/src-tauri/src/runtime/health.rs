use crate::shared::SidecarEvent;
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    time::Duration,
};

const RUNTIME_RAW_EVENT_NAME: &str = "runtime://event";
const JOBS_EVENT_NAME: &str = "jobs://progress";
const SYNC_EVENT_NAME: &str = "sync://state";
const IMPORT_EVENT_NAME: &str = "import://result";

pub fn parse_sidecar_event(line: &str) -> Option<SidecarEvent> {
    serde_json::from_str::<SidecarEvent>(line).ok()
}

pub fn map_sidecar_event_name(event_type: &str) -> Option<&'static str> {
    match event_type {
        "runtime.ready" | "runtime.state" => Some(RUNTIME_RAW_EVENT_NAME),
        "job.progress" | "job.completed" | "job.failed" => Some(JOBS_EVENT_NAME),
        "sync.changed" => Some(SYNC_EVENT_NAME),
        "import.failed" | "import.result" => Some(IMPORT_EVENT_NAME),
        _ => None,
    }
}

pub(crate) fn ping_health(url: &str) -> Result<(), String> {
    let address = url
        .trim_start_matches("http://")
        .trim_end_matches("/health")
        .parse::<SocketAddr>()
        .map_err(|error| format!("invalid health url '{url}': {error}"))?;

    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(1))
        .map_err(|error| error.to_string())?;
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
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") {
        Ok(())
    } else {
        Err("health check returned non-200".to_string())
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
            parsed
                .payload
                .get("version")
                .and_then(|value| value.as_str()),
            Some("0.1.0")
        );
    }

    #[test]
    fn maps_supported_event_names() {
        assert_eq!(
            map_sidecar_event_name("runtime.ready"),
            Some("runtime://event")
        );
        assert_eq!(
            map_sidecar_event_name("job.progress"),
            Some("jobs://progress")
        );
        assert_eq!(
            map_sidecar_event_name("job.completed"),
            Some("jobs://progress")
        );
        assert_eq!(map_sidecar_event_name("sync.changed"), Some("sync://state"));
        assert_eq!(
            map_sidecar_event_name("import.failed"),
            Some("import://result")
        );
        assert_eq!(map_sidecar_event_name("unknown"), None);
    }
}
