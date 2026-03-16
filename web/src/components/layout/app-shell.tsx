"use client";

/**
 * @file 应用外壳布局
 * @description 工作区的顶层布局组件，组合侧边栏、主内容区域和设置弹窗。
 *              包含 OAuth 回调参数处理和全局错误边界。
 */
import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { SettingsModal } from "@/components/settings/settings-modal";
import { useUiStore } from "@/store/use-ui-store";
import { Sidebar } from "@/components/layout/sidebar";
import { WorkspaceErrorBoundary } from "@/components/layout/workspace-error-boundary";

/**
 * OAuth 回调参数处理组件
 * @description 检测 URL 中的 ?settings=xxx 参数，自动打开设置弹窗到对应 Section，
 *              然后从 URL 中移除该参数。用于 OAuth 绑定成功后的回调跳转。
 */
function OAuthRedirectHandler() {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const section = searchParams.get("settings");
    if (section) {
      setSettingsOpen(true, section);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("settings");
      const newUrl = params.toString() ? `${pathname}?${params}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [searchParams, pathname, router, setSettingsOpen]);

  return null;
}

/**
 * 应用外壳组件
 * @description 包含侧边栏导航、主内容区域（带错误边界）和全局设置弹窗。
 * @param children - 路由页面内容
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const settingsOpen = useUiStore((s) => s.settingsOpen);

  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense fallback={null}>
        <OAuthRedirectHandler />
      </Suspense>
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <WorkspaceErrorBoundary>{children}</WorkspaceErrorBoundary>
      </div>
      {settingsOpen && <SettingsModal />}
    </div>
  );
}
