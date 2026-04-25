"use client"

import Link from "next/link"
import { ReactNode } from "react"
import { usePathname } from "next/navigation"
import {
  LayoutGrid,
  GitBranch,
  AlertTriangle,
  Layers,
  Cpu,
  RefreshCw,
} from "lucide-react"

import { useAuth } from "@/features/auth/auth-provider"
import {
  FAILURES_ROUTE,
  HOME_ROUTE,
  TRACES_ROUTE,
  WORKERS_ROUTE,
  WORKLOADS_ROUTE,
} from "@/lib/constants"
import { cn } from "@/lib/utils"

const navItems = [
  { href: HOME_ROUTE, label: "总览", icon: LayoutGrid },
  { href: TRACES_ROUTE, label: "链路", icon: GitBranch },
  { href: FAILURES_ROUTE, label: "故障", icon: AlertTriangle },
  { href: WORKLOADS_ROUTE, label: "任务", icon: Layers },
  { href: WORKERS_ROUTE, label: "Worker", icon: Cpu },
]

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  const pathname = usePathname()
  const { user, logoutAndRedirect, refetch } = useAuth()

  function isActive(href: string) {
    if (href === HOME_ROUTE) {
      return pathname === href
    }
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <div className="grid h-screen grid-cols-[200px_minmax(0,1fr)] overflow-hidden bg-background bg-ops-glow bg-no-repeat">
      {/* Sidebar */}
      <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-r border-white/[0.02] bg-black/20 backdrop-blur-3xl px-3 py-4">
        {/* Brand */}
        <div className="px-3">
          <p className="text-[10px] uppercase tracking-[0.35em] text-accent/60">LyraNote Ops</p>
          <p className="mt-1 text-base font-semibold text-foreground">运维面板</p>
        </div>

        {/* Nav */}
        <nav className="mt-6 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-300",
                  active
                    ? "bg-accent/10 text-accent shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_0_15px_rgba(20,184,166,0.1)] border border-accent/20"
                    : "text-muted hover:bg-white/[0.04] hover:text-foreground border border-transparent",
                )}
              >
                <Icon size={15} className="shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom user block */}
        <div className="mt-auto space-y-3 px-3">
          <div className="border-t border-border/30 pt-4">
            {user ? (
              <div>
                <p className="truncate text-xs font-medium text-foreground">
                  {user.name || user.username || "LyraNote 用户"}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted/60">
                  {user.email || "ops session"}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="flex items-center gap-1 text-[11px] text-muted/60 transition-colors hover:text-foreground"
                  >
                    <RefreshCw size={11} />
                    刷新
                  </button>
                  <button
                    type="button"
                    onClick={() => void logoutAndRedirect()}
                    className="text-[11px] text-muted/60 transition-colors hover:text-danger"
                  >
                    退出登录
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void refetch()}
                className="flex items-center gap-1.5 text-xs text-muted/60 transition-colors hover:text-foreground"
              >
                <RefreshCw size={12} />
                刷新登录态
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex min-h-0 flex-col overflow-hidden">
        {/* Page header */}
        <header className="relative z-10 flex shrink-0 items-center justify-between border-b border-white/[0.02] bg-transparent px-8 py-4 backdrop-blur-xl">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-muted/50">MONITORING</p>
            <h1 className="mt-0.5 text-2xl font-semibold text-foreground">{title}</h1>
            {subtitle ? (
              <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-muted shadow-sm backdrop-blur transition-all hover:bg-white/[0.05] hover:text-foreground"
          >
            <RefreshCw size={13} />
            刷新
          </button>
        </header>

        {/* Page content */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-transparent px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  )
}
