/**
 * @file 统一 HTTP 请求器
 * @description 将 Axios（常规 JSON 请求）和原生 fetch（SSE 流式请求）封装到同一个类中，
 *              对外提供统一的 get/post/patch/put/delete/stream 接口。
 *
 *              核心行为：
 *              - 自动注入 Cookie 中的 Bearer token
 *              - 自动解包 { code, data, message } 统一响应格式
 *              - 401 自动跳转登录页
 *              - 非静默请求自动 toast 错误提示
 */

import axios, { AxiosError, type AxiosInstance } from "axios";
import { INTERNAL_API_BASE } from "@/lib/constants";
import { notifyError } from "@/lib/notify";
import {
  authHeaderFromCookie,
  getErrorMessage,
  handleUnauthorized,
} from "@/lib/request-error";
import { t } from "@/lib/i18n";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

/** 常规请求选项 */
export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number>;
  signal?: AbortSignal;
  /** 设为 true 时不弹 toast 错误提示 */
  skipToast?: boolean;
}

/** 统一响应信封格式 */
interface ApiEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

// ── HttpClient 类 ─────────────────────────────────────────────────────────────

/**
 * 统一 HTTP 请求客户端
 * @description 常规 JSON 请求基于 axios（拦截器链），SSE 流式请求基于原生 fetch。
 */
class HttpClient {
  private ax: AxiosInstance;
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;

    this.ax = axios.create({
      baseURL,
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });

    this.ax.interceptors.request.use((config) => {
      if (typeof document !== "undefined") {
        const match = document.cookie.match(
          /(?:^|;\s*)lyranote_session=([^;]+)/
        );
        const token = match?.[1];
        if (token) config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.ax.interceptors.response.use(
      (res) => {
        const body = res.data;
        if (
          body !== null &&
          typeof body === "object" &&
          "code" in body &&
          "data" in body
        ) {
          if (body.code !== 0) {
            const err = new AxiosError(
              body.message ?? t("errors.requestFailed", "Request failed"),
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
        if (err?.response?.status === 401) handleUnauthorized();
        const shouldNotify =
          typeof window !== "undefined" &&
          err?.config?.headers?.["x-skip-toast"] !== "1";
        if (shouldNotify) notifyError(getErrorMessage(err));
        return Promise.reject(err);
      }
    );
  }

  // ── 常规 JSON 请求（基于 axios）──────────────────────────────────────────

  /**
   * GET 请求
   * @param path - API 路径
   * @param opts - 请求选项
   * @returns 解包后的响应数据
   */
  async get<T>(path: string, opts?: RequestOptions): Promise<T> {
    const res = await this.ax.get<T>(path, this.toAxiosConfig(opts));
    return res.data;
  }

  /**
   * POST 请求
   * @param path - API 路径
   * @param body - 请求体
   * @param opts - 请求选项
   * @returns 解包后的响应数据
   */
  async post<T>(
    path: string,
    body?: unknown,
    opts?: RequestOptions
  ): Promise<T> {
    const res = await this.ax.post<T>(path, body, this.toAxiosConfig(opts));
    return res.data;
  }

  /**
   * PATCH 请求
   * @param path - API 路径
   * @param body - 请求体
   * @param opts - 请求选项
   * @returns 解包后的响应数据
   */
  async patch<T>(
    path: string,
    body?: unknown,
    opts?: RequestOptions
  ): Promise<T> {
    const res = await this.ax.patch<T>(path, body, this.toAxiosConfig(opts));
    return res.data;
  }

  /**
   * PUT 请求
   * @param path - API 路径
   * @param body - 请求体
   * @param opts - 请求选项
   * @returns 解包后的响应数据
   */
  async put<T>(
    path: string,
    body?: unknown,
    opts?: RequestOptions
  ): Promise<T> {
    const res = await this.ax.put<T>(path, body, this.toAxiosConfig(opts));
    return res.data;
  }

  /**
   * DELETE 请求
   * @param path - API 路径
   * @param opts - 请求选项
   * @returns 解包后的响应数据
   */
  async delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    const res = await this.ax.delete<T>(path, this.toAxiosConfig(opts));
    return res.data;
  }

  // ── SSE 流式请求（基于原生 fetch）──────────────────────────────────────────

  /**
   * 发起 SSE 流式 POST 请求
   * @description 使用原生 fetch（axios 不支持 ReadableStream），
   *              内部自动拼 URL、注入认证头、处理 401 和错误状态码。
   * @param path - API 路径
   * @param body - 请求体（会 JSON.stringify）
   * @param opts - 请求选项
   * @returns 原始 Response，调用方通过 body.getReader() 读取流
   */
  async stream(
    path: string,
    body: unknown,
    opts?: RequestOptions
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...authHeaderFromCookie(),
      ...opts?.headers,
    };

    const res = await fetch(this.url(path), {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(body),
      signal: opts?.signal,
    });

    if (res.status === 401) handleUnauthorized();
    if (!res.ok) {
      throw new Error(`Stream request failed: ${res.status}`);
    }
    if (!res.body) {
      throw new Error("No response body");
    }

    return res;
  }

  // ── JSON fetch（非流式，用于需要绕过 axios 的场景）────────────────────────

  /**
   * 带认证和自动解包的 JSON fetch 请求
   * @description 用于 axios 不适用但又需要 JSON 解析的场景（如创建对话后紧接着流式请求）
   * @param path - API 路径
   * @param init - 原生 fetch 的 RequestInit 配置
   * @returns 解包后的响应数据
   */
  async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    const auth = authHeaderFromCookie();
    Object.entries(auth).forEach(([k, v]) => headers.set(k, v));

    const res = await fetch(this.url(path), {
      ...init,
      headers,
      credentials: "include",
    });

    if (res.status === 401) handleUnauthorized();
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }

    const payload = (await res.json()) as ApiEnvelope<T> | T;
    if (
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      "data" in payload
    ) {
      const envelope = payload as ApiEnvelope<T>;
      if (envelope.code !== 0) {
        throw new Error(
          envelope.message ?? t("errors.requestFailed", "Request failed")
        );
      }
      return envelope.data;
    }
    return payload as T;
  }

  // ── 工具方法 ────────────────────────────────────────────────────────────────

  /**
   * 将相对路径拼接为完整的 API URL
   * @param path - API 路径（相对路径或完整 URL）
   * @returns 完整的请求 URL
   */
  url(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (path.startsWith("/")) return `${this.baseURL}${path}`;
    return `${this.baseURL}/${path}`;
  }

  // ── 内部辅助 ────────────────────────────────────────────────────────────────

  /** 将 RequestOptions 转换为 axios config */
  private toAxiosConfig(opts?: RequestOptions) {
    if (!opts) return undefined;
    return {
      headers: {
        ...opts.headers,
        ...(opts.skipToast ? { "x-skip-toast": "1" } : {}),
      },
      params: opts.params,
      signal: opts.signal,
    };
  }
}

// ── 全局单例 ──────────────────────────────────────────────────────────────────

/**
 * 全局 HTTP 客户端实例
 * 使用 INTERNAL_API_BASE：
 * - 服务端 SSR：走 Docker 内网地址（如 http://api:8000/api/v1），避免 ECONNREFUSED
 * - 浏览器端：INTERNAL_API_BASE 与 API_BASE 相同（回退），正常访问
 */
export const http = new HttpClient(INTERNAL_API_BASE);
