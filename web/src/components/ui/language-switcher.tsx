"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/request";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ collapsed }: { collapsed?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("settings");
  const tUi = useTranslations("ui");
  const [isPending, startTransition] = useTransition();

  const handleSwitch = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  if (collapsed) {
    return (
      <button
        type="button"
        title={locale === "zh" ? "Switch to English" : tUi("switchToChinese")}
        onClick={() => handleSwitch(locale === "zh" ? "en" : "zh")}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg text-[11px] font-bold text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
          isPending && "opacity-50"
        )}
      >
        {locale === "zh" ? tUi("langEn") : tUi("langZh")}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg py-2.5 pl-3 pr-3">
      <span className="text-[11px] font-bold text-muted-foreground/50 w-4 text-center select-none">
        {locale === "zh" ? tUi("langZh") : tUi("langEn")}
      </span>
      <div className="flex gap-0.5 rounded-md border border-border/30 bg-muted/20 p-0.5">
        {(["zh", "en"] as Locale[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => handleSwitch(l)}
            disabled={isPending}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
              locale === l
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`languages.${l}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
