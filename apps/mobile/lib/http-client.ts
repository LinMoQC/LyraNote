/**
 * @file 移动端 HTTP 客户端实例
 * @description 从 SecureStore 异步读取 token，注入到 @lyranote/api-client。
 */
import { createHttpClient, type HttpClient } from "@lyranote/api-client";
import { getToken, getServerUrl } from "./storage";
import { router } from "expo-router";

let _client: HttpClient | null = null;
let _baseURL: string | null = null;

export async function getHttpClient(): Promise<HttpClient> {
  const serverUrl = await getServerUrl();

  if (!_client || _baseURL !== serverUrl) {
    _baseURL = serverUrl;
    _client = createHttpClient({
      baseURL: serverUrl,
      getToken,
      onUnauthorized: () => {
        router.replace("/(auth)/login");
      },
      onError: (msg) => {
        console.error("[API Error]", msg);
      },
    });
  }

  return _client;
}

export function invalidateClient() {
  _client = null;
  _baseURL = null;
}
