"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useConfigForm } from "../hooks/use-config-form";
import { FieldInput, SaveButton } from "../settings-primitives";

export function PersonalitySection() {
  const t = useTranslations("settings");
  const { form, loading, saving, saved, error, set, save } = useConfigForm();

  async function handleSave() {
    await save({
      ai_name: form.ai_name,
      user_occupation: form.user_occupation,
      user_preferences: form.user_preferences,
      custom_system_prompt: form.custom_system_prompt,
    });
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <FieldInput label={t("personality.aiName")} description={t("personality.aiNameDesc")} value={form.ai_name ?? ""} onChange={(v) => set("ai_name", v)} placeholder="Lyra" />
      <FieldInput label={t("personality.occupation")} description={t("personality.occupationDesc")} value={form.user_occupation ?? ""} onChange={(v) => set("user_occupation", v)} placeholder={t("personality.occupationPlaceholder")} />
      <FieldInput label={t("personality.interests")} description={t("personality.interestsDesc")} value={form.user_preferences ?? ""} onChange={(v) => set("user_preferences", v)} placeholder={t("personality.interestsPlaceholder")} />
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("personality.customPrompt")}</p>
        <p className="text-xs text-muted-foreground">{t("personality.customPromptDesc")}</p>
        <textarea value={form.custom_system_prompt ?? ""} onChange={(e) => set("custom_system_prompt", e.target.value)}
          placeholder={t("personality.customPromptPlaceholder")} rows={5}
          className="w-full resize-none rounded-xl border border-border/50 bg-muted/50 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20" />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <SaveButton onClick={handleSave} saving={saving} saved={saved} />
    </div>
  );
}
