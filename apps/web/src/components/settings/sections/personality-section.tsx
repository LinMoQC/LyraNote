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
    });
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <FieldInput label={t("personality.aiName")} description={t("personality.aiNameDesc")} value={form.ai_name ?? ""} onChange={(v) => set("ai_name", v)} placeholder="Lyra" />
      <FieldInput label={t("personality.occupation")} description={t("personality.occupationDesc")} value={form.user_occupation ?? ""} onChange={(v) => set("user_occupation", v)} placeholder={t("personality.occupationPlaceholder")} />
      <FieldInput label={t("personality.interests")} description={t("personality.interestsDesc")} value={form.user_preferences ?? ""} onChange={(v) => set("user_preferences", v)} placeholder={t("personality.interestsPlaceholder")} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <SaveButton onClick={handleSave} saving={saving} saved={saved} />
    </div>
  );
}
