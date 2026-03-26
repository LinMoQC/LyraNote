"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { m } from "framer-motion"
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/features/auth/auth-provider"
import { AUTH } from "@/lib/api-routes"
import { http } from "@/lib/http-client"
import { createLoginSchema, type LoginFormValues } from "@/schemas/login-schema"
import { getSetupStatus, login } from "@/services/auth-service"
import { cn } from "@/lib/utils"

type FormValues = LoginFormValues

export default function SignInPage() {
  const router = useRouter()
  const t = useTranslations("login")
  const { refetch } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    getSetupStatus().catch(() => {
      // code 1001 → HTTP client interceptor auto-redirects to /setup
    })
  }, [])

  const schema = createLoginSchema(t)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setError(null)
    try {
      await login(values)
      await refetch()
      router.push("/app")
    } catch {
      setError(t("loginFailed"))
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[400px]"
      >
        {/* ── Brand ── */}
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="relative flex h-14 w-14 items-center justify-center">
            {/* Multi-layer glow */}
            <div className="absolute inset-0 rounded-2xl bg-primary/15 blur-xl" />
            <div className="absolute inset-1 rounded-xl bg-gradient-to-br from-primary/10 to-violet-500/10 blur-md" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-border/50 bg-card shadow-lg">
              <Image src="/lyra.png" alt="LyraNote" width={26} height={26} className="object-contain" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold tracking-tight text-foreground">LyraNote</p>
            <p className="text-xs text-muted-foreground/60">{t("tagline")}</p>
          </div>
        </div>

        {/* ── Card ── */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xl shadow-black/20">
          {/* Top glow accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <div className="p-7">
            {/* Card title */}
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-foreground">{t("welcomeBack")}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Username */}
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-medium text-muted-foreground">
                  {t("username")}
                </Label>
                <Input
                  id="username"
                  placeholder={t("usernamePlaceholder")}
                  autoComplete="username"
                  autoFocus
                  className={cn(
                    "h-10 rounded-xl",
                    errors.username && "border-destructive/60 focus:ring-destructive/20"
                  )}
                  {...register("username")}
                />
                {errors.username && (
                  <p className="text-[11px] text-destructive">{errors.username.message}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  {t("password")}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("passwordPlaceholder")}
                    autoComplete="current-password"
                    className={cn(
                      "h-10 rounded-xl pr-10",
                      errors.password && "border-destructive/60 focus:ring-destructive/20"
                    )}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[11px] text-destructive">{errors.password.message}</p>
                )}
              </div>

              {/* Error */}
              {error && (
                <m.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
                >
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-destructive" />
                  {error}
                </m.div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  "mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl",
                  "bg-primary text-sm font-semibold text-primary-foreground",
                  "shadow-md shadow-primary/25 transition-all",
                  "hover:bg-primary/90 hover:shadow-primary/35",
                  "active:scale-[0.98]",
                  "disabled:pointer-events-none disabled:opacity-60"
                )}
              >
                {isSubmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <LogIn size={15} />
                    {t("loginBtn")}
                  </>
                )}
              </button>
            </form>

            {/* OAuth divider */}
            <div className="mt-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-[11px] text-muted-foreground/50">{t("thirdPartyLogin")}</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>

            {/* OAuth buttons */}
            <div className="mt-3 flex flex-col gap-2.5">
              <OAuthButton
                label={t("loginWithGoogle")}
                href={http.url(AUTH.oauthLogin("google"))}
                icon={<Image src="/icons/google.svg" alt="" width={16} height={16} aria-hidden />}
              />
              <OAuthButton
                label={t("loginWithGitHub")}
                href={http.url(AUTH.oauthLogin("github"))}
                icon={<Image src="/icons/github.svg" alt="" width={16} height={16} className="dark:invert" aria-hidden />}
              />
            </div>
          </div>

          {/* Bottom divider accent */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
        </div>

        {/* Footer */}
        <p className="mt-5 text-center text-[11px] text-muted-foreground/40">
          {t("selfHosted")}
        </p>
      </m.div>
    </div>
  )
}

interface OAuthButtonProps {
  label: string
  href: string
  icon: React.ReactNode
}

function OAuthButton({ label, href, icon }: OAuthButtonProps) {
  return (
    <a
      href={href}
      className={cn(
        "flex h-10 w-full items-center justify-center gap-2.5 rounded-xl",
        "border border-border/60 bg-card text-sm font-medium text-foreground",
        "transition-all hover:bg-accent hover:border-border",
        "active:scale-[0.98]"
      )}
    >
      {icon}
      {label}
    </a>
  )
}
