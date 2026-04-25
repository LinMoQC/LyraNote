use crate::shared::DesktopFileProbe;
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use super::pdf_probe::probe_pdf_page_count;

pub fn probe_file_metadata(path: &Path) -> Result<DesktopFileProbe, String> {
    if !path.exists() {
        return Err(format!("path does not exist: {}", path.display()));
    }

    let metadata =
        fs::metadata(path).map_err(|error| format!("failed to read metadata: {error}"))?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    let mime_hint = guess_mime_hint(path, metadata.is_dir());
    let pdf_page_count = if metadata.is_dir() {
        None
    } else {
        probe_pdf_page_count(path)?
    };

    Ok(DesktopFileProbe {
        path: path.display().to_string(),
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .map(str::to_string)
            .unwrap_or_else(|| path.display().to_string()),
        is_dir: metadata.is_dir(),
        size_bytes: (!metadata.is_dir()).then_some(metadata.len()),
        extension,
        mime_hint,
        created_at: metadata.created().ok().map(system_time_to_epoch_string),
        modified_at: metadata.modified().ok().map(system_time_to_epoch_string),
        pdf_page_count,
    })
}

fn system_time_to_epoch_string(value: SystemTime) -> String {
    value
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

fn guess_mime_hint(path: &Path, is_dir: bool) -> Option<String> {
    if is_dir {
        return Some("inode/directory".to_string());
    }
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => Some("application/pdf".to_string()),
        Some("md") => Some("text/markdown".to_string()),
        Some("txt") => Some("text/plain".to_string()),
        Some("docx") => Some(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string(),
        ),
        Some("json") => Some("application/json".to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_path(name: &str, ext: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("lyranote-{name}-{suffix}.{ext}"))
    }

    #[test]
    fn probes_text_file_metadata() {
        let path = temp_path("probe", "md");
        fs::write(&path, "# notes").unwrap();

        let probe = probe_file_metadata(&path).unwrap();
        assert_eq!(probe.name, path.file_name().unwrap().to_string_lossy());
        assert_eq!(probe.extension.as_deref(), Some("md"));
        assert_eq!(probe.mime_hint.as_deref(), Some("text/markdown"));
        assert_eq!(probe.size_bytes, Some(7));
        assert!(!probe.is_dir);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn probes_pdf_page_count_when_applicable() {
        let path = temp_path("probe-pdf", "pdf");
        let sample =
            b"%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Page >> endobj\n";
        fs::write(&path, sample).unwrap();

        let probe = probe_file_metadata(&path).unwrap();
        assert_eq!(probe.mime_hint.as_deref(), Some("application/pdf"));
        assert_eq!(probe.pdf_page_count, Some(2));

        let _ = fs::remove_file(path);
    }
}
