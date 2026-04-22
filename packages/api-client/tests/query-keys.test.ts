import { describe, expect, it } from "vitest";

import { lyraQueryKeys } from "../src/lib/query-keys";

describe("lyraQueryKeys", () => {
  it("normalizes params so object key order does not affect cache keys", () => {
    expect(
      lyraQueryKeys.sources.list({ limit: 20, search: "agent", offset: 10 }),
    ).toEqual(
      lyraQueryKeys.sources.list({ search: "agent", offset: 10, limit: 20 }),
    );
  });

  it("drops undefined values from params", () => {
    expect(
      lyraQueryKeys.conversations.list({ scope: "global", offset: undefined }),
    ).toEqual(["conversations", "list", { scope: "global" }]);
  });
});
