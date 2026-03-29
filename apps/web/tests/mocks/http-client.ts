import { vi } from "vitest";

export const http = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  stream: vi.fn(),
  fetchJson: vi.fn(),
  url: vi.fn((path: string) => path),
};

export function resetHttpClientMocks() {
  http.get.mockReset();
  http.post.mockReset();
  http.patch.mockReset();
  http.put.mockReset();
  http.delete.mockReset();
  http.stream.mockReset();
  http.fetchJson.mockReset();
  http.url.mockClear();
}
