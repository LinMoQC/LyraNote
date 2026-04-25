/**
 * @file 平台无关 HTTP 客户端
 * @description 工厂函数 createHttpClient() 接受 baseURL 和 getToken 回调，
 *              返回统一的 get/post/patch/put/delete/stream/fetchJson 接口。
 *
 *              三端使用方式：
 *              - Web：baseURL = NEXT_PUBLIC_API_BASE_URL，credentials = include（依赖 httpOnly cookie）
 *              - Desktop：baseURL = 用户配置的 server URL，getToken = () => localStorage token
 *              - Mobile：baseURL = 用户配置的 server URL，getToken = () => SecureStore token
 */

import axios, { AxiosError, type AxiosInstance } from "axios";

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  signal?: AbortSignal;
  /** 设为 true 时调用方自行处理错误，不触发 onError 回调 */
  skipErrorHandler?: boolean;
}

export interface ApiEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

export interface HttpClientConfig {
  baseURL: string;
  /** 返回当前 Bearer token，无 token 时返回 null */
  getToken: () => string | null | Promise<string | null>;
  /** 是否让 axios 自动携带 cookie（Web 跨端口 API 场景） */
  withCredentials?: boolean;
  /** 原生 fetch 使用的 credentials 策略 */
  credentials?: RequestCredentials;
  /** 401 时的处理回调 */
  onUnauthorized?: () => void;
  /** 系统未初始化时的处理回调 */
  onNotConfigured?: () => void;
  /** 通用错误回调（非 skipErrorHandler 请求） */
  onError?: (message: string) => void;
}

export const CODE_NOT_CONFIGURED = 1001;

function shouldSetJsonContentType(body: BodyInit | null | undefined) {
  if (body == null) return false;
  if (typeof FormData !== "undefined" && body instanceof FormData) return false;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return false;
  if (typeof Blob !== "undefined" && body instanceof Blob) return false;
  if (typeof body === "string") return false;
  if (body instanceof ArrayBuffer) return false;
  if (ArrayBuffer.isView(body)) return false;
  return true;
}

// ── HttpClient ────────────────────────────────────────────────────────────────

export class HttpClient {
  private ax: AxiosInstance;
  readonly baseURL: string;
  private getToken: HttpClientConfig["getToken"];
  private requestCredentials?: RequestCredentials;
  private onUnauthorized?: () => void;
  private onNotConfigured?: () => void;
  private onError?: (message: string) => void;

  constructor(config: HttpClientConfig) {
    this.baseURL = config.baseURL;
    this.getToken = config.getToken;
    this.requestCredentials = config.credentials;
    this.onUnauthorized = config.onUnauthorized;
    this.onNotConfigured = config.onNotConfigured;
    this.onError = config.onError;

    this.ax = axios.create({
      baseURL: config.baseURL,
      headers: { "Content-Type": "application/json" },
      withCredentials: config.withCredentials,
    });

    this.ax.interceptors.request.use(async (cfg) => {
      const token = await Promise.resolve(this.getToken());
      if (token) cfg.headers.Authorization = `Bearer ${token}`;
      return cfg;
    });

    this.ax.interceptors.response.use(
      (res) => {
        const body = res.data;
        if (body !== null && typeof body === "object" && "code" in body && "data" in body) {
          if (body.code === CODE_NOT_CONFIGURED) {
            this.onNotConfigured?.();
            return Promise.reject(new AxiosError("System not configured", String(CODE_NOT_CONFIGURED)));
          }
          if (body.code !== 0) {
            const err = new AxiosError(
              (body.message as string) ?? "Request failed",
              String(body.code),
              res.config,
              res.request,
              { ...res, data: { detail: body.message } }
            );
            return Promise.reject(err);
          }
          res.data = body.data;
        }
        return res;
      },
      (err: AxiosError) => {
        if (err?.response?.status === 401) this.onUnauthorized?.();
        const skipHandler = err?.config?.headers?.["x-skip-error-handler"] === "1";
        if (!skipHandler && this.onError) {
          const msg =
            (err?.response?.data as { detail?: string } | null)?.detail ??
            err.message ??
            "Request failed";
          this.onError(msg);
        }
        return Promise.reject(err);
      }
    );
  }

  // ── JSON 请求 ─────────────────────────────────────────────────────────────

  async get<T>(path: string, opts?: RequestOptions): Promise<T> {
    const res = await this.ax.get<T>(path, this.toAxiosConfig(opts));
    return res.data;
  }

  async post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    const res = await this.ax.post<T>(path, body, this.toAxiosConfig(opts));
    return res.data;
  }

  async patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    const res = await this.ax.patch<T>(path, body, this.toAxiosConfig(opts));
    return res.data;
  }

  async put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    const res = await this.ax.put<T>(path, body, this.toAxiosConfig(opts));
    return res.data;
  }

  async delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    const res = await this.ax.delete<T>(path, this.toAxiosConfig(opts));
    return res.data;
  }

  // ── SSE 流（原生 fetch）───────────────────────────────────────────────────

  /**
   * 发起 SSE POST 流式请求，返回原始 Response（调用方读取 body.getReader()）。
   * 兼容 Web / Desktop / React Native（RN fetch 支持 ReadableStream）。
   */
  async stream(path: string, body: unknown, opts?: RequestOptions): Promise<Response> {
    const token = await Promise.resolve(this.getToken());
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    };

    const res = await fetch(this.url(path), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: opts?.signal,
      credentials: this.requestCredentials,
    });

    if (res.status === 401) this.onUnauthorized?.();
    if (!res.ok) throw new Error(`Stream request failed: ${res.status}`);
    if (!res.body) throw new Error("No response body");

    return res;
  }

  // ── JSON fetch（非流式，用于需要绕过 axios 拦截器的场景）────────────────

  async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await Promise.resolve(this.getToken());
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("Content-Type") && shouldSetJsonContentType(init.body)) {
      headers.set("Content-Type", "application/json");
    }
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(this.url(path), {
      ...init,
      headers,
      credentials: init.credentials ?? this.requestCredentials,
    });

    if (res.status === 401) this.onUnauthorized?.();
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);

    const payload = (await res.json()) as ApiEnvelope<T> | T;
    if (payload && typeof payload === "object" && "code" in payload && "data" in payload) {
      const envelope = payload as ApiEnvelope<T>;
      if (envelope.code === CODE_NOT_CONFIGURED) {
        this.onNotConfigured?.();
        throw new Error("System not configured");
      }
      if (envelope.code !== 0) throw new Error(envelope.message ?? "Request failed");
      return envelope.data;
    }
    return payload as T;
  }

  // ── 工具 ─────────────────────────────────────────────────────────────────

  url(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (path.startsWith("/")) return `${this.baseURL}${path}`;
    return `${this.baseURL}/${path}`;
  }

  private toAxiosConfig(opts?: RequestOptions) {
    if (!opts) return undefined;
    return {
      headers: {
        ...opts.headers,
        ...(opts.skipErrorHandler ? { "x-skip-error-handler": "1" } : {}),
      },
      params: opts.params,
      signal: opts.signal,
    };
  }
}

// ── 工厂函数 ──────────────────────────────────────────────────────────────────

export function createHttpClient(config: HttpClientConfig): HttpClient {
  return new HttpClient(config);
}
