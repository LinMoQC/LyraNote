"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { LOGIN_ROUTE } from "@/lib/constants";

export function ProtectedView({
  unauthorized,
  children,
}: {
  unauthorized: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const shouldRedirect = unauthorized || (!isLoading && !isAuthenticated);

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(LOGIN_ROUTE);
    }
  }, [router, shouldRedirect]);

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card/80 p-8 text-sm text-muted">
        正在校验登录态...
      </div>
    );
  }

  if (shouldRedirect) {
    return (
      <div className="rounded-3xl border border-border bg-card/80 p-8 text-sm text-muted">
        登录状态已失效，正在跳转到登录页。
      </div>
    );
  }

  return <>{children}</>;
}
