"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { t } from "@/lib/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-card p-6 text-center">
          <div className="mb-3 flex justify-center">
            <AlertTriangle className="text-red-400" size={24} />
          </div>
          <p className="mb-2 text-base font-semibold">{t("errors.pageError", "Something went wrong")}</p>
          <p className="mb-5 text-sm text-muted-foreground">{t("errors.pageErrorRetry", "Please retry or refresh the page.")}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <RefreshCw size={14} />
            {t("errors.reload")}
          </button>
        </div>
      </div>
    );
  }
}
