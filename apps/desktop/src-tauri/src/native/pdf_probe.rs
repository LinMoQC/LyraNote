use std::{fs, path::Path};

pub fn probe_pdf_page_count(path: &Path) -> Result<Option<u32>, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if extension.as_deref() != Some("pdf") {
        return Ok(None);
    }

    let content = fs::read(path).map_err(|error| format!("failed to read pdf: {error}"))?;
    if !content.starts_with(b"%PDF-") {
        return Ok(None);
    }

    let pattern = b"/Type /Page";
    let mut count = 0_u32;
    let mut index = 0_usize;
    while let Some(relative) = content[index..]
        .windows(pattern.len())
        .position(|window| window == pattern)
    {
        let absolute = index + relative;
        let next = content.get(absolute + pattern.len()).copied();
        if next != Some(b's') {
            count += 1;
        }
        index = absolute + pattern.len();
        if index >= content.len() {
            break;
        }
    }

    Ok((count > 0).then_some(count))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_path(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("lyranote-{name}-{suffix}.pdf"))
    }

    #[test]
    fn estimates_pdf_page_count_from_page_markers() {
        let path = temp_path("pdf-probe");
        let sample = b"%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Page >> endobj\n3 0 obj << /Type /Pages >> endobj\n";
        fs::write(&path, sample).unwrap();

        assert_eq!(probe_pdf_page_count(&path).unwrap(), Some(2));

        let _ = fs::remove_file(path);
    }
}
