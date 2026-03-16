"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { getMemoryDoc, updateMemoryDoc } from "@/services/memory-service";
import { SaveButton } from "../settings-primitives";

export function MemorySection() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    getMemoryDoc()
      .then((d) => { setContent(d.content_md); setUpdatedAt(d.updated_at); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      await updateMemoryDoc(content);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      setUpdatedAt(new Date().toISOString());
    } catch { setError(tc("saveFailed")); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-xl border border-border/50 bg-muted/10 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground/80">{t("memory.whatIsTitle")}</p>
        <p>{t("memory.whatIsDesc")}</p>
        {updatedAt && <p className="pt-1 opacity-60">{t("memory.lastUpdated", { date: new Date(updatedAt).toLocaleString() })}</p>}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("memory.globalDoc")}</p>
        <p className="text-xs text-muted-foreground">{t("memory.globalDocDesc")}</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("memory.placeholder")}
          rows={14}
          className="w-full resize-none rounded-xl border border-border/50 bg-muted/50 px-3 py-2.5 text-sm font-mono text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <SaveButton onClick={handleSave} saving={saving} saved={saved} />
    </div>
  );
}
