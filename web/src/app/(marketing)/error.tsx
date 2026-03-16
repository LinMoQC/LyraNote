"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[MarketingError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-card p-6 text-center">
        <div className="mb-3 flex justify-center">
          <AlertTriangle className="text-red-400" size={24} />
        </div>
        <p className="mb-2 text-base font-semibold">Something went wrong</p>
        <p className="mb-5 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    </div>
  );
}
