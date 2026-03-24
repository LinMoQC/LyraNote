"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useThemePreset, type ThemePreset } from "@/lib/theme-preset";
import { SettingRow } from "../settings-primitives";

const LYRA_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18 C9 18, 4 14, 4 9 A5 5 0 0 1 14 9 L14 20" />
    <path d="M14 9 C14 9, 19 14, 19 9" />
  </svg>
);

const NOTION_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
  </svg>
);

export function AppearanceSection() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  const { themePreset, setThemePreset } = useThemePreset();

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

      <SettingRow label={t("themePreset")} description={t("themePresetDesc")}>
        <div className="flex gap-2">
          {(["lyra", "notion"] as ThemePreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setThemePreset(preset)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors",
                themePreset === preset
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {preset === "lyra" ? LYRA_ICON : NOTION_ICON}
              {t(`themePresetOptions.${preset}`)}
            </button>
          ))}
        </div>
      </SettingRow>
    </div>
  );
}
