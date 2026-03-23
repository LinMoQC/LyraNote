import { useMemo, useState } from "react";

export type StreamLifecycleState = "idle" | "streaming" | "finalizing" | "failed";

export function useStreamLifecycle() {
  const [state, setState] = useState<StreamLifecycleState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);

  return useMemo(
    () => ({
      state,
      lastError,
      isStreaming: state === "streaming" || state === "finalizing",
      start() {
        setState("streaming");
        setLastError(null);
      },
      finalize() {
        setState("finalizing");
      },
      finish() {
        setState("idle");
      },
      fail(message: string) {
        setLastError(message);
        setState("failed");
      },
      resetError() {
        setLastError(null);
        if (state === "failed") setState("idle");
      },
    }),
    [lastError, state],
  );
}
