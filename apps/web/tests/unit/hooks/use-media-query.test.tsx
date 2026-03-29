import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "@/hooks/use-media-query";

describe("useMediaQuery", () => {
  it("syncs to the current matchMedia value after mount", async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      addEventListener,
      removeEventListener,
    }));

    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));

    await waitFor(() => {
      expect(result.current.matches).toBe(true);
      expect(result.current.ready).toBe(true);
    });
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
  });
});
