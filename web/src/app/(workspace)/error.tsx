"use client";

/**
 * @file 工作区路由错误边界
 * @description Next.js 约定的 error.tsx，当工作区内的任何路由段抛出未捕获异常时，
 *              展示友好的错误提示界面并提供「重试」按钮。
 */
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { t } from "@/lib/i18n";

/**
 * 工作区错误边界页面组件
 * @param error - Next.js 捕获到的错误对象
 * @param reset - 调用此函数可重新尝试渲染失败的路由段
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[WorkspaceError]", error);
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
          {t("errors.pageErrorRetry", "Please retry or refresh the page.")}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <RefreshCw size={14} />
          {t("errors.reload", "Reload")}
        </button>
      </div>
    </div>
  );
}
