"use client";

/**
 * @file 应用外壳布局
 * @description 工作区的顶层布局组件，组合侧边栏、主内容区域和设置弹窗。
 *              包含 OAuth 回调参数处理和全局错误边界。
 *              移动端（< md）显示顶部导航栏 + Drawer 侧边栏，桌面端保持原有左右分栏布局。
 */
import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
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
 * 移动端顶部导航栏（仅在 < md 时显示）
 */
function MobileTopBar() {
  const t = useTranslations("nav");
  const setSidebarMobileOpen = useUiStore((s) => s.setSidebarMobileOpen);
  const sidebarMobileOpen = useUiStore((s) => s.sidebarMobileOpen);
  const mobileHeaderRight = useUiStore((s) => s.mobileHeaderRight);
  const mobileHeaderMode = useUiStore((s) => s.mobileHeaderMode);

  if (mobileHeaderMode === "hidden") return null;

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border/40 bg-sidebar px-4 md:hidden">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSidebarMobileOpen(!sidebarMobileOpen)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          aria-label={t("openMenu")}
        >
          {sidebarMobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="flex items-center gap-2">
          <Image src="/lyra.png" alt="Lyra" width={24} height={24} className="rounded-sm" />
          <span className="text-sm font-semibold text-foreground">LyraNote</span>
        </div>
      </div>
      {mobileHeaderRight && (
        <div className="flex items-center">{mobileHeaderRight}</div>
      )}
    </header>
  );
}

/**
 * 应用外壳组件
 * @description 包含侧边栏导航、主内容区域（带错误边界）和全局设置弹窗。
 * @param children - 路由页面内容
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const sidebarMobileOpen = useUiStore((s) => s.sidebarMobileOpen);
  const setSidebarMobileOpen = useUiStore((s) => s.setSidebarMobileOpen);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-sidebar md:flex-row md:gap-2">
      <Suspense fallback={null}>
        <OAuthRedirectHandler />
      </Suspense>

      {/* 移动端顶部导航栏 */}
      <MobileTopBar />

      {/* 移动端背景蒙层 */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 侧边栏（移动端为 Drawer，桌面端为固定侧栏） */}
      <Sidebar />

      {/* 主内容区 — 凸起面板 */}
      <div className="min-h-0 flex-1 overflow-y-auto md:my-2 md:mr-2 md:rounded-2xl md:border md:border-border/20 md:bg-background md:shadow-md">
        <WorkspaceErrorBoundary>{children}</WorkspaceErrorBoundary>
      </div>

      {settingsOpen && <SettingsModal />}
    </div>
  );
}
