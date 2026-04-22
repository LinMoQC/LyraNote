use crate::{
    runtime::{now_iso_string, sidecar::resolved_state_dir},
    shared::DesktopSecretKey,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Runtime};

use super::keychain::{delete_generic_password, read_generic_password, write_generic_password};

const SECRET_KEYCHAIN_SERVICE: &str = "com.lyranote.desktop.secret";
const SECRET_INDEX_FILENAME: &str = "secure-secrets-index.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SecretIndex {
    items: Vec<DesktopSecretKey>,
}

pub fn store_secret<R: Runtime>(
    app: &AppHandle<R>,
    key: String,
    value: String,
) -> Result<DesktopSecretKey, String> {
    let key = validate_secret_key(&key)?;
    write_generic_password(SECRET_KEYCHAIN_SERVICE, &key, &value)?;

    let mut index = load_secret_index(&secret_index_path(app))?;
    let updated_at = now_iso_string();
    let item = DesktopSecretKey {
        key: key.clone(),
        updated_at,
    };
    upsert_secret_key(&mut index.items, item.clone());
    persist_secret_index(&secret_index_path(app), &index)?;
    Ok(item)
}

pub fn get_secret(key: String) -> Result<Option<String>, String> {
    let key = validate_secret_key(&key)?;
    read_generic_password(SECRET_KEYCHAIN_SERVICE, &key)
}

pub fn delete_secret<R: Runtime>(app: &AppHandle<R>, key: String) -> Result<(), String> {
    let key = validate_secret_key(&key)?;
    delete_generic_password(SECRET_KEYCHAIN_SERVICE, &key)?;
    let index_path = secret_index_path(app);
    let mut index = load_secret_index(&index_path)?;
    index.items.retain(|item| item.key != key);
    persist_secret_index(&index_path, &index)?;
    Ok(())
}

pub fn list_secret_keys<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<DesktopSecretKey>, String> {
    let index = load_secret_index(&secret_index_path(app))?;
    Ok(index.items)
}

fn secret_index_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    resolved_state_dir(app).join(SECRET_INDEX_FILENAME)
}

fn upsert_secret_key(items: &mut Vec<DesktopSecretKey>, next: DesktopSecretKey) {
    if let Some(existing) = items.iter_mut().find(|item| item.key == next.key) {
        *existing = next;
    } else {
        items.push(next);
    }
    items.sort_by(|left, right| left.key.cmp(&right.key));
}

fn load_secret_index(path: &Path) -> Result<SecretIndex, String> {
    if !path.exists() {
        return Ok(SecretIndex::default());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read secure secret index: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("invalid secure secret index: {error}"))
}

fn persist_secret_index(path: &Path, index: &SecretIndex) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create secure secret state dir: {error}"))?;
    }
    let raw = serde_json::to_string_pretty(index)
        .map_err(|error| format!("failed to encode secure secret index: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("failed to persist secure secret index: {error}"))
}

pub(crate) fn validate_secret_key(value: &str) -> Result<String, String> {
    let candidate = value.trim();
    if candidate.is_empty() {
        return Err("secret key cannot be empty".to_string());
    }
    if candidate.len() > 80 {
        return Err("secret key is too long".to_string());
    }
    if candidate
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Ok(candidate.to_string());
    }
    Err("secret key may only contain letters, numbers, '.', '-' and '_'".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("lyranote-{name}-{suffix}.json"))
    }

    #[test]
    fn validates_secret_keys() {
        assert_eq!(
            validate_secret_key("device.identity_1").unwrap(),
            "device.identity_1".to_string()
        );
        assert!(validate_secret_key("bad key").is_err());
        assert!(validate_secret_key("").is_err());
    }

    #[test]
    fn persists_secret_index_in_sorted_order() {
        let path = temp_path("secret-index");
        let index = SecretIndex {
            items: vec![
                DesktopSecretKey {
                    key: "beta".to_string(),
                    updated_at: "2".to_string(),
                },
                DesktopSecretKey {
                    key: "alpha".to_string(),
                    updated_at: "1".to_string(),
                },
            ],
        };
        persist_secret_index(&path, &index).unwrap();

        let mut loaded = load_secret_index(&path).unwrap();
        upsert_secret_key(
            &mut loaded.items,
            DesktopSecretKey {
                key: "gamma".to_string(),
                updated_at: "3".to_string(),
            },
        );
        upsert_secret_key(
            &mut loaded.items,
            DesktopSecretKey {
                key: "alpha".to_string(),
                updated_at: "4".to_string(),
            },
        );

        assert_eq!(
            loaded
                .items
                .iter()
                .map(|item| item.key.as_str())
                .collect::<Vec<_>>(),
            vec!["alpha", "beta", "gamma"]
        );
        assert_eq!(loaded.items[0].updated_at, "4");

        let _ = fs::remove_file(path);
    }
}
