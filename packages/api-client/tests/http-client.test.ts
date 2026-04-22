import { afterEach, describe, expect, it, vi } from "vitest";

import { createHttpClient } from "../src/lib/client";

describe("createHttpClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lets web callers opt into cookie credentials for axios and fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createHttpClient({
      baseURL: "http://localhost:8000/api/v1",
      getToken: () => null,
      withCredentials: true,
      credentials: "include",
    });

    expect((client as { ax: { defaults: { withCredentials?: boolean } } }).ax.defaults.withCredentials).toBe(true);

    await client.fetchJson("/config");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/config",
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });

  it("still injects bearer tokens when a platform provides one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: { id: "user-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createHttpClient({
      baseURL: "https://api.example.com",
      getToken: () => "token-123",
    });

    await client.fetchJson("/auth/me");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer token-123");
    expect(init.credentials).toBeUndefined();
  });
});
