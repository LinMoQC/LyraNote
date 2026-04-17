use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;

const KEYCHAIN_SERVICE: &str = "com.lyranote.desktop.session";
const KEYCHAIN_ACCOUNT: &str = "default";

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

pub fn hydrate_session() -> Result<SecureSession, String> {
    match read_keychain_secret()? {
        Some(raw) => {
            let parsed: SecureSessionRecord =
                serde_json::from_str(&raw).map_err(|error| format!("invalid stored session: {error}"))?;
            Ok(SecureSession {
                has_session: true,
                access_token: Some(parsed.access_token),
                user_id: parsed.user_id,
                username: parsed.username,
                user: parsed.user,
            })
        }
        None => Ok(SecureSession {
            has_session: false,
            access_token: None,
            user_id: None,
            username: None,
            user: None,
        }),
    }
}

pub fn store_session(payload: SecureSessionRecord) -> Result<SecureSession, String> {
    let raw = serde_json::to_string(&payload).map_err(|error| format!("failed to encode session: {error}"))?;
    let output = Command::new("security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
            "-w",
            &raw,
        ])
        .output()
        .map_err(|error| format!("failed to invoke security: {error}"))?;

    if !output.status.success() {
        return Err(stderr_or_default(&output.stderr, "failed to persist session"));
    }

    hydrate_session()
}

pub fn clear_session() -> Result<(), String> {
    let output = Command::new("security")
        .args([
            "delete-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
        ])
        .output()
        .map_err(|error| format!("failed to invoke security: {error}"))?;

    if output.status.success() || stderr_contains(&output.stderr, "could not be found") {
        return Ok(());
    }

    Err(stderr_or_default(&output.stderr, "failed to clear stored session"))
}

fn read_keychain_secret() -> Result<Option<String>, String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
            "-w",
        ])
        .output()
        .map_err(|error| format!("failed to invoke security: {error}"))?;

    if output.status.success() {
        let password = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if password.is_empty() {
            return Ok(None);
        }
        return Ok(Some(password));
    }

    if stderr_contains(&output.stderr, "could not be found") {
        return Ok(None);
    }

    Err(stderr_or_default(&output.stderr, "failed to read stored session"))
}

fn stderr_contains(stderr: &[u8], needle: &str) -> bool {
    String::from_utf8_lossy(stderr).contains(needle)
}

fn stderr_or_default(stderr: &[u8], default: &str) -> String {
    let content = String::from_utf8_lossy(stderr).trim().to_string();
    if content.is_empty() {
        default.to_string()
    } else {
        content
    }
}
