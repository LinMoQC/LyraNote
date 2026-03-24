/**
 * @file 安全存储工具
 * @description 使用 expo-secure-store 持久化 token 和 server URL。
 */
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "lyranote_token";
const SERVER_URL_KEY = "lyranote_server_url";
const DEFAULT_SERVER_URL = "http://localhost:8000/api/v1";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getServerUrl(): Promise<string> {
  const url = await SecureStore.getItemAsync(SERVER_URL_KEY);
  return url ?? DEFAULT_SERVER_URL;
}

export async function setServerUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(SERVER_URL_KEY, url);
}
