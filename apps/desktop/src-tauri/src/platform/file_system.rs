use std::process::Command;

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

pub fn open_path_with_default_app(path: &str) -> Result<(), String> {
    let output = Command::new("open")
        .arg(path)
        .output()
        .map_err(|error| format!("failed to open path: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
