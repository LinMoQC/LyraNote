use crate::shared::DesktopHashResult;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{BufReader, Read},
    path::Path,
};

pub fn compute_sha256_for_path(path: &Path) -> Result<DesktopHashResult, String> {
    if !path.exists() {
        return Err(format!("file does not exist: {}", path.display()));
    }
    if !path.is_file() {
        return Err(format!("path is not a file: {}", path.display()));
    }

    let file = File::open(path).map_err(|error| format!("failed to open file: {error}"))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];
    let mut bytes_processed = 0_u64;

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("failed to read file: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        bytes_processed += read as u64;
    }

    let digest = format!("{:x}", hasher.finalize());
    Ok(DesktopHashResult {
        path: path.display().to_string(),
        algorithm: "sha256".to_string(),
        digest,
        bytes_processed,
    })
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
        std::env::temp_dir().join(format!("lyranote-{name}-{suffix}.txt"))
    }

    #[test]
    fn computes_stable_sha256_digest() {
        let path = temp_path("hash");
        fs::write(&path, b"hello world").unwrap();

        let hash = compute_sha256_for_path(&path).unwrap();
        assert_eq!(
            hash.digest,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
        assert_eq!(hash.bytes_processed, 11);

        let _ = fs::remove_file(path);
    }
}
