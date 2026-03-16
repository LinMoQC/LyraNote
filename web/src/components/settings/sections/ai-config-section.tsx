"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  DEFAULT_BASE_URL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_LLM_MODEL,
  EMBEDDING_MODELS,
  LLM_MODELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { testLlmConnection } from "@/services/config-service";
import { useConfigForm } from "../hooks/use-config-form";
import { FieldInput, FieldSelectRow, SaveButton } from "../settings-primitives";

export function AIConfigSection() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { form, loading, saving, saved, error, set, save } = useConfigForm();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSave() {
    await save({
      openai_api_key: form.openai_api_key,
      openai_base_url: form.openai_base_url,
      llm_model: form.llm_model,
      embedding_model: form.embedding_model,
      tavily_api_key: form.tavily_api_key,
      perplexity_api_key: form.perplexity_api_key,
    });
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <FieldInput label={t("ai.apiKeyLabel")} description={t("ai.apiKeyDesc")} type="password"
        value={form.openai_api_key === "••••••••" ? "" : (form.openai_api_key ?? "")}
        onChange={(v) => set("openai_api_key", v)}
        placeholder={form.openai_api_key === "••••••••" ? tc("alreadySetHint") : "sk-..."} />
      <FieldInput label={t("ai.baseUrlLabel")} description={t("ai.baseUrlDesc")}
        value={form.openai_base_url ?? ""} onChange={(v) => set("openai_base_url", v)}
        placeholder={DEFAULT_BASE_URL} />
      <FieldSelectRow label={t("ai.llmModel")} description={t("ai.llmModelDesc")}
        value={form.llm_model ?? DEFAULT_LLM_MODEL}
        options={LLM_MODELS}
        onChange={(v) => set("llm_model", v)} />
      <FieldSelectRow label={t("ai.embeddingModel")} description={t("ai.embeddingModelDesc")}
        value={form.embedding_model ?? DEFAULT_EMBEDDING_MODEL}
        options={EMBEDDING_MODELS}
        onChange={(v) => set("embedding_model", v)} />
      <FieldInput label={t("ai.tavilyKeyLabel")} description={t("ai.tavilyKeyDesc")} type="password"
        value={form.tavily_api_key === "••••••••" ? "" : (form.tavily_api_key ?? "")}
        onChange={(v) => set("tavily_api_key", v)}
        placeholder={form.tavily_api_key === "••••••••" ? tc("alreadySetHint") : "tvly-..."} />
      <FieldInput label={t("ai.perplexityKeyLabel")} description={t("ai.perplexityKeyDesc")} type="password"
        value={form.perplexity_api_key === "••••••••" ? "" : (form.perplexity_api_key ?? "")}
        onChange={(v) => set("perplexity_api_key", v)}
        placeholder={form.perplexity_api_key === "••••••••" ? tc("alreadySetHint") : "pplx-..."} />

      {testResult && (
        <div className={cn(
          "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
          testResult.ok
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            : "border-red-500/20 bg-red-500/10 text-red-400"
        )}>
          <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", testResult.ok ? "bg-emerald-500" : "bg-red-500")} />
          <span className="flex-1 break-all">{testResult.ok ? t("ai.testSuccess") : testResult.message}</span>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
        <button
          type="button"
          onClick={async () => {
            setTesting(true); setTestResult(null);
            try {
              const result = await testLlmConnection();
              setTestResult({ ok: result.ok, message: result.ok ? `${result.model} ✓` : result.message });
            } catch {
              setTestResult({ ok: false, message: t("ai.testFailed") });
            } finally { setTesting(false); }
          }}
          disabled={testing}
          className="flex h-9 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground disabled:opacity-50"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : null}
          {t("ai.testConnection")}
        </button>
      </div>
    </div>
  );
}
