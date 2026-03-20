"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { testEmailConnection } from "@/services/config-service";
import { useConfigForm } from "../hooks/use-config-form";
import { FieldInput, SaveButton } from "../settings-primitives";

export function NotifySection() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { form, loading, saving, saved, error, set, save } = useConfigForm();
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  async function handleSave() {
    await save({
      notify_email: form.notify_email,
      smtp_host: form.smtp_host,
      smtp_port: form.smtp_port,
      smtp_username: form.smtp_username,
      smtp_password: form.smtp_password,
      smtp_from: form.smtp_from,
    });
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <FieldInput label={t("notify.email")} description={t("notify.emailDesc")}
        type="email" value={form.notify_email ?? ""} onChange={(v) => set("notify_email", v)} placeholder="you@example.com" />

      <div className="space-y-4 rounded-xl border border-border/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("notify.smtpTitle")}</p>
        <FieldInput label={t("notify.smtpHost")} value={form.smtp_host ?? ""} onChange={(v) => set("smtp_host", v)} placeholder="smtp.example.com" />
        <FieldInput label={t("notify.smtpPort")} value={form.smtp_port ?? ""} onChange={(v) => set("smtp_port", v)} placeholder="587" />
        <FieldInput label={t("notify.username")} value={form.smtp_username ?? ""} onChange={(v) => set("smtp_username", v)} placeholder="your@email.com" />
        <FieldInput label={t("notify.password")} type="password"
          value={form.smtp_password === "••••••••" ? "" : (form.smtp_password ?? "")}
          onChange={(v) => set("smtp_password", v)}
          placeholder={form.smtp_password === "••••••••" ? tc("alreadySetHint") : t("notify.smtpPasswordPlaceholder")} />
        <FieldInput label={t("notify.fromAddress")} description={t("notify.fromAddressDesc")}
          value={form.smtp_from ?? ""} onChange={(v) => set("smtp_from", v)} placeholder="LyraNote <noreply@example.com>" />
      </div>

      {testMsg && (
        <p className={cn("text-xs", testMsg.startsWith("✓") ? "text-emerald-400" : "text-destructive")}>{testMsg}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
        <button
          type="button"
          onClick={async () => {
            setTestSending(true); setTestMsg(null);
            try {
              const result = await testEmailConnection();
              setTestMsg(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`);
            } catch {
              setTestMsg(`✗ ${t("notify.testFailed")}`);
            }
            setTestSending(false);
          }}
          disabled={testSending}
          className="flex h-9 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground disabled:opacity-50"
        >
          {testSending ? <Loader2 size={14} className="animate-spin" /> : null}
          {t("notify.sendTest")}
        </button>
      </div>
    </div>
  );
}
