import { vi } from "vitest";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export const http = {
  get: vi.fn(),
  post: vi.fn(),
};

export function resetHttpClientMocks() {
  http.get.mockReset();
  http.post.mockReset();
}
