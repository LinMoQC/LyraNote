"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { AUTH } from "@/lib/api-routes";
import { http } from "@/lib/http-client";
import { SettingRow } from "../settings-primitives";

const OAUTH_PROVIDERS = [
  {
    id: "github" as const,
    label: "GitHub",
    descKey: "security.githubDesc" as const,
    icon: <Image src="/icons/github.svg" alt="" width={16} height={16} className="dark:invert" aria-hidden />,
  },
  {
    id: "google" as const,
    label: "Google",
    descKey: "security.googleDesc" as const,
    icon: <Image src="/icons/google.svg" alt="" width={16} height={16} aria-hidden />,
  },
];

export function SecuritySection() {
  const t = useTranslations("settings");
  const { user, logout, refetch } = useAuth();
  const [unbinding, setUnbinding] = useState<string | null>(null);
  const [unbindError, setUnbindError] = useState<string | null>(null);

  async function handleUnbind(provider: "google" | "github") {
    setUnbinding(provider);
    setUnbindError(null);
    try {
      const { unbindOAuth } = await import("@/services/auth-service");
      await unbindOAuth(provider);
      await refetch();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setUnbindError(detail ?? t("security.unbindFailed"));
    } finally {
      setUnbinding(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("security.thirdParty")}</p>
          <p className="mt-1 text-xs text-muted-foreground/70">{t("security.thirdPartyDesc")}</p>
        </div>
        {unbindError && <p className="text-xs text-destructive">{unbindError}</p>}
        {OAUTH_PROVIDERS.map((p) => {
          const isBound = p.id === "google" ? user?.has_google : user?.has_github;
          return (
            <div key={p.id} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30">
                  {p.icon}
                </div>
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{t(p.descKey)}</p>
                </div>
              </div>
              {isBound ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 rounded-xl bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t("security.bound")}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUnbind(p.id)}
                    disabled={unbinding === p.id}
                    className="flex h-7 items-center gap-1 rounded-xl border border-border/50 px-2.5 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                  >
                    {unbinding === p.id ? <Loader2 size={11} className="animate-spin" /> : null}
                    {t("security.unbind")}
                  </button>
                </div>
              ) : (
                <a
                  href={http.url(AUTH.oauthBind(p.id))}
                  className="flex h-8 items-center gap-1.5 rounded-xl border border-border/50 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {t("security.bind")}
                </a>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("security.session")}</p>
        <SettingRow label={t("security.currentSession")} description={t("security.sessionDesc")}>
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            {t("security.logout")}
          </button>
        </SettingRow>
      </div>
    </div>
  );
}
