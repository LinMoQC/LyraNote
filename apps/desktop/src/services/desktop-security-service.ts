import {
  secureSecretDelete,
  secureSecretGet,
  secureSecretListKeys,
  secureSecretStore,
} from "@/lib/desktop-bridge"

export function listSecureSecrets() {
  return secureSecretListKeys()
}

export function saveSecureSecret(key: string, value: string) {
  return secureSecretStore(key, value)
}

export function getSecureSecret(key: string) {
  return secureSecretGet(key)
}

export function deleteSecureSecret(key: string) {
  return secureSecretDelete(key)
}
