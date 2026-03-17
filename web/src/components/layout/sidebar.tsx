"use client";

/**
 * @file 应用侧边栏导航
 * @description 全局侧边栏组件，包含应用 Logo、主导航链接（首页、对话、知识库、
 *              定时任务）、笔记本列表、AI 洞察面板和用户菜单。
 *              支持折叠/展开和 AI 主动洞察轮询。
 */

import { useAuth } from "@/features/auth/auth-provider";
import { AnimatePresence, m } from "framer-motion";
import {
  Check,
  ChevronDown,
  Clock,
  Eye,
  FolderOpen,
  Home,
  LibraryBig,
  Lightbulb,
  LogOut,
  MessageSquare,
  PanelLeft,
  Settings
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useMediaQuery } from "@/hooks/use-media-query";
import { INSIGHT_POLL_INTERVAL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  getInsights,
  markInsightRead,
  markAllInsightsRead,
  type ProactiveInsight,
} from "@/services/ai-service";
import { getNotebooks } from "@/services/notebook-service";
import { useUiStore } from "@/store/use-ui-store";
import type { Notebook } from "@/types";

const navItemDefs = [
  { href: "/app", labelKey: "home" as const, icon: Home, exact: true },
  { href: "/app/notebooks", labelKey: "notebooks" as const, icon: FolderOpen, exact: false },
  { href: "/app/knowledge", labelKey: "knowledge" as const, icon: LibraryBig, exact: false },
  { href: "/app/chat", labelKey: "chat" as const, icon: MessageSquare, exact: false },
  { href: "/app/tasks", labelKey: "tasks" as const, icon: Clock, exact: false },
];

function Label({ collapsed, children, className }: { collapsed: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap transition-opacity duration-150",
        collapsed ? "opacity-0 select-none" : "opacity-100",
        className
      )}
    >
      {children}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const sidebarMobileOpen = useUiStore((s) => s.sidebarMobileOpen);
  const setSidebarMobileOpen = useUiStore((s) => s.setSidebarMobileOpen);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [logoHovered, setLogoHovered] = useState(false);
  const [recentNotebooks, setRecentNotebooks] = useState<Pick<Notebook, "id" | "title">[]>([]);
  const [notebooksLoading, setNotebooksLoading] = useState(true);
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentOpen, setRecentOpen] = useState(true);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collapseTooltip, setCollapseTooltip] = useState<{ x: number; y: number } | null>(null);
  const [expandTooltip, setExpandTooltip] = useState<{ x: number; y: number } | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const logoIconRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setHydrated(true) }, []);
  const { user, isLoading: userLoading, logout } = useAuth();

  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current?.contains(e.target as Node)) return;
      setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);
  const userLoaded = !userLoading;
  const tNav = useTranslations("nav");
  const tSettings = useTranslations("settings");

  useEffect(() => {
    getNotebooks()
      .then((nbs) => setRecentNotebooks(nbs.slice(0, 5).map(({ id, title }) => ({ id, title }))))
      .catch(() => undefined)
      .finally(() => setNotebooksLoading(false));
  }, []);

  const fetchInsights = () => {
    getInsights()
      .then((data) => {
        setInsights(data.insights ?? []);
        setUnreadCount(data.unread_count ?? 0);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    fetchInsights();
    const timer = setInterval(fetchInsights, INSIGHT_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  const handleMarkRead = (id: string) => {
    markInsightRead(id).then(fetchInsights).catch(() => undefined);
  };
  const handleMarkAllRead = () => {
    markAllInsightsRead().then(fetchInsights).catch(() => undefined);
  };

  return (
    <m.aside
      initial={false}
      animate={
        isMobile
          ? { x: sidebarMobileOpen ? 0 : -288 }
          : { width: collapsed ? 64 : 240 }
      }
      transition={hydrated ? { type: "spring", stiffness: 320, damping: 32, restDelta: 0.5 } : { duration: 0 }}
      className={cn(
        "flex h-screen flex-shrink-0 flex-col overflow-hidden bg-sidebar",
        isMobile
          ? "fixed left-0 top-0 z-50 w-72"
          : ""
      )}
      style={isMobile ? undefined : { width: collapsed ? 64 : 240 }}
    >
      {/* ── Brand ─────────────────────────────────────── */}
      <div className="flex h-16 flex-shrink-0 items-center justify-between px-2">
        <button
          type="button"
          onClick={() => {
            if (collapsed) { toggle(); }
            else { router.push("/app"); }
          }}
          onMouseEnter={() => {
            if (collapsed) {
              setLogoHovered(true);
              const rect = logoIconRef.current?.getBoundingClientRect();
              if (rect) setExpandTooltip({ x: rect.right + 8, y: rect.top + rect.height / 2 });
            }
          }}
          onMouseLeave={() => { setLogoHovered(false); setExpandTooltip(null); }}
          className={cn(
            "flex flex-shrink-0 items-center gap-3 rounded-lg py-1.5 transition-colors",
            collapsed ? "cursor-e-resize pl-2" : "cursor-pointer px-1.5 hover:bg-foreground/[0.06]"
          )}
        >
          <div ref={logoIconRef} className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center">
            <m.div
              animate={{ opacity: collapsed && logoHovered ? 0 : 1, scale: collapsed && logoHovered ? 0.6 : 1 }}
              transition={{ duration: 0.14 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Image src="/lyra.png" alt="Lyra" width={28} height={28} className="rounded-sm" />
            </m.div>
            <m.div
              animate={{ opacity: collapsed && logoHovered ? 1 : 0, scale: collapsed && logoHovered ? 1 : 0.6 }}
              transition={{ duration: 0.14 }}
              className="absolute inset-0 flex items-center justify-center text-foreground"
            >
              <PanelLeft size={20} />
            </m.div>
          </div>

          <Label collapsed={collapsed} className="text-sm font-semibold text-foreground">
            LyraNote
          </Label>
        </button>

        <div className="relative">
          <button
            onClick={toggle}
            type="button"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setCollapseTooltip({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
            }}
            onMouseLeave={() => setCollapseTooltip(null)}
            className={cn(
              "flex h-8 w-8 cursor-w-resize flex-shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-all duration-150 hover:bg-foreground/[0.06] hover:text-foreground",
              collapsed || isMobile ? "pointer-events-none opacity-0" : "opacity-100"
            )}
            tabIndex={collapsed || isMobile ? -1 : 0}
          >
            <PanelLeft size={20} />
          </button>
        </div>
      </div>

      {expandTooltip && createPortal(
        <div
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-3 py-1.5 text-xs text-white shadow-lg"
          style={{ left: expandTooltip.x, top: expandTooltip.y }}
        >
          {tNav("expandSidebar")}
        </div>,
        document.body
      )}
      {collapseTooltip && createPortal(
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-3 py-1.5 text-xs text-white shadow-lg"
          style={{ left: collapseTooltip.x, top: collapseTooltip.y }}
        >
          {tNav("collapseSidebar")}
        </div>,
        document.body
      )}

      {/* ── Nav ───────────────────────────────────────── */}
      <nav className="flex-shrink-0 space-y-0.5 px-2 pt-1">
        {navItemDefs.map(({ href, labelKey, icon: Icon, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          const label = tNav(labelKey);

          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              onClick={() => { if (isMobile) setSidebarMobileOpen(false); }}
              className={cn(
                "flex items-center gap-3 rounded-lg py-2.5 pl-3 pr-3 text-sm transition-colors",
                isActive
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
              )}
            >
              <Icon size={20} className="flex-shrink-0" />
              <Label collapsed={collapsed}>{label}</Label>
            </Link>
          );
        })}
      </nav>

      {/* ── Recent + Insights (scrollable) ────────────── */}
      <div
        className={cn(
          "sidebar-scroll mt-4 flex-1 overflow-y-auto px-2 transition-opacity duration-150",
          collapsed ? "pointer-events-none select-none opacity-0" : "opacity-100"
        )}
      >
        {/* Recent */}
        <div>
          <button
            type="button"
            onClick={() => setRecentOpen((v) => !v)}
            className="mb-0.5 flex w-full items-center gap-1 rounded-md px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-muted-foreground/60"
          >
            <ChevronDown
              size={12}
              className={cn("flex-shrink-0 transition-transform duration-150", !recentOpen && "-rotate-90")}
            />
            {tNav("recent")}
          </button>
          <AnimatePresence initial={false}>
            {recentOpen && (
              <m.div
                key="recent-list"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="space-y-0.5">
                  {notebooksLoading
                    ? [68, 80, 55].map((w, i) => (
                        <div
                          key={i}
                          className="mx-1 my-0.5 animate-pulse rounded-md bg-foreground/[0.04]"
                          style={{ height: 26, width: `${w}%`, animationDelay: `${i * 60}ms` }}
                        />
                      ))
                        : recentNotebooks.map((nb) => (
                        <Link
                          key={nb.id}
                          href={`/app/notebooks/${nb.id}`}
                          onClick={() => { if (isMobile) setSidebarMobileOpen(false); }}
                          className={cn(
                            "block truncate rounded-lg py-1.5 pl-3 pr-2 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground",
                            pathname.includes(nb.id) && "bg-foreground/[0.08] text-foreground"
                          )}
                        >
                          {nb.title}
                        </Link>
                      ))}
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        {/* AI Insights */}
        {insights.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setInsightsOpen((v) => !v)}
              className="mb-0.5 flex w-full items-center gap-1 rounded-md px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-muted-foreground/60"
            >
              <ChevronDown
                size={12}
                className={cn("flex-shrink-0 transition-transform duration-150", !insightsOpen && "-rotate-90")}
              />
              <span className="flex items-center gap-1.5">
                AI 洞察
                {unreadCount > 0 && (
                  <span className="rounded-full bg-primary/20 px-1.5 py-px text-[9px] font-bold leading-none text-primary">
                    {unreadCount}
                  </span>
                )}
              </span>
              {unreadCount > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); handleMarkAllRead(); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleMarkAllRead(); } }}
                  className="ml-auto text-[10px] text-muted-foreground/30 hover:text-foreground/60"
                >
                  全部已读
                </span>
              )}
            </button>
            <AnimatePresence initial={false}>
              {insightsOpen && (
                <m.div
                  key="insights-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="space-y-px">
                    {insights.slice(0, 5).map((insight) => {
                      const isCompleted = insight.insight_type === "task_completed";
                      return (
                        <div
                          key={insight.id}
                          className="group flex items-center gap-2 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.05]"
                        >
                          {isCompleted ? (
                            <Check size={11} className="flex-shrink-0 text-emerald-400" />
                          ) : (
                            <Lightbulb size={11} className="flex-shrink-0 text-amber-400" />
                          )}
                          {insight.notebook_id ? (
                            <Link
                              href={`/app/notebooks/${insight.notebook_id}`}
                              className="min-w-0 flex-1 truncate text-[12px] hover:text-foreground"
                            >
                              {insight.title}
                            </Link>
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-[12px]">{insight.title}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleMarkRead(insight.id)}
                            className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                            title="标记已读"
                          >
                            <Eye size={10} className="text-muted-foreground/30 hover:text-foreground/60" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Bottom ────────────────────────────────────── */}
      <div className="flex-shrink-0 space-y-0.5 border-t border-foreground/[0.06] px-2 py-3">

        <ThemeToggle collapsed={collapsed} />

        <button
          type="button"
          title={collapsed ? tSettings("title") : undefined}
          onClick={() => useUiStore.getState().setSettingsOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg py-2.5 pl-3 pr-3 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <Settings size={20} className="flex-shrink-0" />
          <Label collapsed={collapsed}>{tSettings("title")}</Label>
        </button>

        <div ref={userMenuRef} className="relative">
          {userLoaded ? (
            <>
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex w-full items-center gap-3 rounded-lg py-2 pl-3 pr-3 text-left transition-colors hover:bg-foreground/[0.06]"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                {user?.avatar_url ? (
                  <Image
                    src={user.avatar_url}
                    alt={user.name ?? user.username ?? "Avatar"}
                    width={32}
                    height={32}
                    className="h-[22px] w-[22px] flex-shrink-0 rounded-full object-cover ring-1 ring-foreground/10"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      (e.currentTarget.nextElementSibling as HTMLElement | null)?.classList.remove("hidden");
                    }}
                  />
                ) : null}
                <div
                  className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary ${user?.avatar_url ? "hidden" : ""}`}
                >
                  {(user?.name?.[0] ?? user?.username?.[0] ?? "U").toUpperCase()}
                </div>
                <Label collapsed={collapsed} className="truncate text-sm font-medium text-foreground">
                  {user?.name ?? user?.username ?? "Account"}
                </Label>
              </button>
              {userMenuOpen && (
                <div
                  className="absolute bottom-full left-0 z-50 mb-1 min-w-[200px] max-w-[calc(100%+8px)] overflow-hidden rounded-xl border border-foreground/10 bg-sidebar shadow-lg"
                  style={{ width: collapsed ? 200 : "100%" }}
                  role="menu"
                >
                  <div className="border-b border-foreground/[0.06] px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {user?.name ?? user?.username ?? "Account"}
                    </p>
                    {user?.username && user.username !== (user?.name ?? "") && (
                      <p className="truncate text-xs text-muted-foreground">{user.username}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void logout();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                    role="menuitem"
                  >
                    <LogOut size={14} />
                    退出登录
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-lg py-2 pl-3 pr-3">
              <div className="h-[22px] w-[22px] flex-shrink-0 animate-pulse rounded-full bg-foreground/[0.06]" />
              <Label collapsed={collapsed}>
                <div className="h-3 w-20 animate-pulse rounded bg-foreground/[0.05]" />
              </Label>
            </div>
          )}
        </div>
      </div>
    </m.aside>
  );
}
