"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/features/auth/auth-provider"
import { HOME_ROUTE } from "@/lib/constants"
import { login } from "@/services/auth-service"

export function LoginPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading, user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(HOME_ROUTE)
    }
  }, [isAuthenticated, isLoading, router])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setLoading(true)
    setError(null)

    try {
      await login({
        username: String(form.get("username") || ""),
        password: String(form.get("password") || ""),
      })
      router.replace(HOME_ROUTE)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-ops-glow px-6 text-foreground">
      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="mb-8 text-center">
          <p className="text-[10px] uppercase tracking-[0.35em] text-accent/60">LyraNote Ops</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">运维面板</h1>
          <p className="mt-1.5 text-sm text-muted/70">使用系统账号登录，复用后端会话鉴权。</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-xl border border-border/50 bg-card/50 backdrop-blur"
        >
          <div className="border-b border-border/30 px-6 py-4">
            <p className="text-xs font-semibold text-foreground">账号登录</p>
          </div>

          <div className="space-y-4 p-6">
            {user ? (
              <p className="rounded-lg border border-border/40 bg-card/50 px-4 py-3 text-xs text-muted/80">
                已检测到当前会话，正在进入监控面板。
              </p>
            ) : null}

            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-[11px] uppercase tracking-[0.18em] text-muted/60"
              >
                用户名
              </label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                className="w-full rounded-lg border border-border/50 bg-background/60 px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/30 focus:border-accent/50"
                placeholder="admin"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[11px] uppercase tracking-[0.18em] text-muted/60"
              >
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="w-full rounded-lg border border-border/50 bg-background/60 px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/30 focus:border-accent/50"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-slate-950 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "登录中..." : "进入面板"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
