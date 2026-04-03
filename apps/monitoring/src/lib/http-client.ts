import { API_BASE } from "@/lib/constants";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

interface RequestOptions {
  params?: Record<string, string | number | undefined>;
  method?: string;
  body?: unknown;
}

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export class HttpClient {
  constructor(private readonly baseUrl: string) {}

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, options);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body });
  }

  private async request<T>(path: string, options?: RequestOptions): Promise<T> {
    const resolved = this.resolve(path);
    const usesAbsoluteUrl = resolved.startsWith("http://") || resolved.startsWith("https://");
    const url = new URL(resolved, "http://localhost");
    for (const [key, value] of Object.entries(options?.params ?? {})) {
      if (value != null) {
        url.searchParams.set(key, String(value));
      }
    }

    const requestUrl = usesAbsoluteUrl ? url.toString() : `${url.pathname}${url.search}`;
    const response = await fetch(requestUrl, {
      method: options?.method ?? "GET",
      headers: options?.body ? { "Content-Type": "application/json" } : undefined,
      credentials: "include",
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 401) {
      throw new UnauthorizedError();
    }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const payload = (await response.json()) as ApiEnvelope<T>;
    if (payload.code !== 0) {
      throw new Error(payload.message || "Request failed");
    }
    return payload.data;
  }

  private resolve(path: string) {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }
}

export const http = new HttpClient(API_BASE);
