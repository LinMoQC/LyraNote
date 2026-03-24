/**
 * @file 共享 HTTP 客户端实例
 * @description 从 Tauri plugin-store 读取 server URL 和 token，注入到 api-client。
 */
import { createHttpClient, type HttpClient } from "@lyranote/api-client";

const DEFAULT_BASE_URL = "http://localhost:8000/api/v1";

let _client: HttpClient | null = null;

function getToken(): string | null {
  return localStorage.getItem("lyranote_token");
}

export function setToken(token: string) {
  localStorage.setItem("lyranote_token", token);
}

export function clearToken() {
  localStorage.removeItem("lyranote_token");
}

export function getServerUrl(): string {
  return localStorage.getItem("lyranote_server_url") ?? DEFAULT_BASE_URL;
}

export function setServerUrl(url: string) {
  localStorage.setItem("lyranote_server_url", url);
  _client = null; // invalidate cached instance
}

export function getHttpClient(): HttpClient {
  if (!_client) {
    _client = createHttpClient({
      baseURL: getServerUrl(),
      getToken,
      onUnauthorized: () => {
        clearToken();
        window.location.hash = "/login";
      },
      onError: (msg) => {
        console.error("[API Error]", msg);
      },
    });
  }
  return _client;
}
