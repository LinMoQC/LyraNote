"use client";

import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { t } from "@/lib/i18n";

export default function NotebookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[NotebookError]", error);
  }, [error]);

  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-card p-6 text-center">
        <div className="mb-3 flex justify-center">
          <AlertTriangle className="text-red-400" size={24} />
        </div>
        <p className="mb-2 text-base font-semibold">
          {t("errors.pageError", "Something went wrong")}
        </p>
        <p className="mb-5 text-sm text-muted-foreground">
          {t("errors.pageErrorRetry", "Failed to load notebook. Please try again.")}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/app/notebooks"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft size={14} />
            {t("errors.backToList", "Back")}
          </Link>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <RefreshCw size={14} />
            {t("errors.reload", "Retry")}
          </button>
        </div>
      </div>
    </div>
  );
}
