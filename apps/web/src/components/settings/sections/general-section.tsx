"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/request";
import { CustomSelect, SettingRow, Toggle } from "../settings-primitives";

export function GeneralSection() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fontSize, setFontSize] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("editor-font-size") ?? "14" : "14"
  );
  const [autoSave, setAutoSave] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("auto-save") !== "false" : true
  );

  function handleLangChange(v: string) {
    startTransition(async () => {
      await setLocale(v as Locale);
      router.refresh();
    });
  }

  function handleFontSizeChange(v: string) {
    setFontSize(v);
    localStorage.setItem("editor-font-size", v);
    document.documentElement.style.setProperty("--editor-font-size", `${v}px`);
  }

  function handleAutoSaveChange(v: boolean) {
    setAutoSave(v);
    localStorage.setItem("auto-save", String(v));
  }

  return (
    <div className="space-y-5">
      <SettingRow label={t("language")} description={t("languageDesc")}>
        <CustomSelect
          value={locale}
          options={[{ value: "zh", label: t("languages.zh") }, { value: "en", label: "English" }]}
          onChange={handleLangChange}
        />
      </SettingRow>
      <SettingRow label={t("fontSize")} description={t("fontSizeDesc")}>
        <CustomSelect
          value={fontSize}
          options={["12", "13", "14", "15", "16", "18"].map((s) => ({ value: s, label: `${s}px` }))}
          onChange={handleFontSizeChange}
        />
      </SettingRow>
      <SettingRow label={t("autoSave")} description={t("autoSaveDesc")}>
        <Toggle checked={autoSave} onChange={handleAutoSaveChange} />
      </SettingRow>
    </div>
  );
}
