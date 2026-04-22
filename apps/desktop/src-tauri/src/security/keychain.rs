use std::process::Command;

pub fn read_generic_password(service: &str, account: &str) -> Result<Option<String>, String> {
    let output = Command::new("security")
        .args(["find-generic-password", "-s", service, "-a", account, "-w"])
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

    Err(stderr_or_default(
        &output.stderr,
        "failed to read stored keychain entry",
    ))
}

pub fn write_generic_password(service: &str, account: &str, value: &str) -> Result<(), String> {
    let output = Command::new("security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            service,
            "-a",
            account,
            "-w",
            value,
        ])
        .output()
        .map_err(|error| format!("failed to invoke security: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    Err(stderr_or_default(
        &output.stderr,
        "failed to persist keychain entry",
    ))
}

pub fn delete_generic_password(service: &str, account: &str) -> Result<(), String> {
    let output = Command::new("security")
        .args(["delete-generic-password", "-s", service, "-a", account])
        .output()
        .map_err(|error| format!("failed to invoke security: {error}"))?;

    if output.status.success() || stderr_contains(&output.stderr, "could not be found") {
        return Ok(());
    }

    Err(stderr_or_default(
        &output.stderr,
        "failed to clear stored keychain entry",
    ))
}

pub fn stderr_contains(stderr: &[u8], needle: &str) -> bool {
    String::from_utf8_lossy(stderr).contains(needle)
}

pub fn stderr_or_default(stderr: &[u8], default: &str) -> String {
    let content = String::from_utf8_lossy(stderr).trim().to_string();
    if content.is_empty() {
        default.to_string()
    } else {
        content
    }
}
