"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { SettingRow } from "../settings-primitives";

export function AppearanceSection() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  return (
    <div className="space-y-5">
      <SettingRow label={t("theme")} description={t("themeDesc")}>
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => setTheme(th)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors",
                theme === th ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {th === "light" ? <Sun size={13} /> : <Moon size={13} />}
              {th === "light" ? t("themeOptions.light") : t("themeOptions.dark")}
            </button>
          ))}
        </div>
      </SettingRow>
    </div>
  );
}
