use crate::shared::{SecureSession, SecureSessionRecord};

use super::keychain::{delete_generic_password, read_generic_password, write_generic_password};

const KEYCHAIN_SERVICE: &str = "com.lyranote.desktop.session";
const KEYCHAIN_ACCOUNT: &str = "default";

pub fn hydrate_session() -> Result<SecureSession, String> {
    match read_keychain_secret()? {
        Some(raw) => {
            let parsed: SecureSessionRecord = serde_json::from_str(&raw)
                .map_err(|error| format!("invalid stored session: {error}"))?;
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
    let raw = serde_json::to_string(&payload)
        .map_err(|error| format!("failed to encode session: {error}"))?;
    write_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, &raw)?;

    hydrate_session()
}

pub fn clear_session() -> Result<(), String> {
    delete_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
}

fn read_keychain_secret() -> Result<Option<String>, String> {
    read_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
}
