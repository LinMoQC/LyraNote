import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpClient } from "@/lib/http-client";

describe("HttpClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps absolute API hosts when baseUrl is absolute", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { ok: true }, message: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpClient("http://localhost:8000/api/v1");
    await client.get("/auth/me", { params: { include: "profile" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/me?include=profile",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("uses relative paths when baseUrl is relative", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { ok: true }, message: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpClient("/api/v1");
    await client.get("/monitoring/overview", { params: { window: "24h" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/monitoring/overview?window=24h",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });
});
