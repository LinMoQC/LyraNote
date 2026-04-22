use crate::shared::SelectedPath;
use std::path::PathBuf;
use std::process::Command;

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

pub fn dialog_pick_watch_folder() -> Result<Option<SelectedPath>, String> {
    let script = r#"set chosenFolder to choose folder
return POSIX path of chosenFolder"#;

    let output = Command::new("osascript")
        .args(["-e", script])
        .output()
        .map_err(|error| format!("failed to open folder picker: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("User canceled") {
            return Ok(None);
        }
        return Err(stderr.trim().to_string());
    }

    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if raw.is_empty() {
        return Ok(None);
    }
    Ok(Some(path_to_selected(&raw, true)))
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
