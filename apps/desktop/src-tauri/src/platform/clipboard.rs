use std::io::Write;
use std::process::{Command, Stdio};

pub fn copy_path_to_clipboard(path: &str) -> Result<(), String> {
    let mut child = Command::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to access clipboard: {error}"))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(path.as_bytes())
            .map_err(|error| format!("failed to write clipboard contents: {error}"))?;
    }
    let status = child
        .wait()
        .map_err(|error| format!("failed to finalize clipboard write: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("clipboard write failed".to_string())
    }
}
