"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  DEFAULT_BASE_URL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_LLM_MODEL,
  DEFAULT_RERANKER_BASE_URL,
  DEFAULT_RERANKER_MODEL,
  EMBEDDING_MODELS,
  LLM_MODELS,
  RERANKER_MODELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { testEmbeddingConnection, testLlmConnection, testRerankerConnection, testUtilityLlmConnection } from "@/services/config-service";
import { useConfigForm } from "../hooks/use-config-form";
import { FieldInput, FieldModelRow, FieldSelectRow, SaveButton } from "../settings-primitives";

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-2 pb-3 pt-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </span>
      {note && (
        <span className="text-[11px] text-muted-foreground/50">{note}</span>
      )}
    </div>
  );
}

interface TestResult { ok: boolean; message: string }

function SectionTestButton({
  onTest,
  testing,
  result,
}: {
  onTest: () => void
  testing: boolean
  result: TestResult | null
}) {
  const t = useTranslations("settings");
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        type="button"
        onClick={onTest}
        disabled={testing}
        className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground disabled:opacity-50"
      >
        {testing ? <Loader2 size={12} className="animate-spin" /> : null}
        {t("testConnection")}
      </button>
      {result && (
        <span className={cn(
          "flex items-center gap-1.5 text-xs",
          result.ok ? "text-emerald-400" : "text-red-400"
        )}>
          <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", result.ok ? "bg-emerald-500" : "bg-red-500")} />
          {result.message}
        </span>
      )}
    </div>
  );
}

export function AIConfigSection() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { form, loading, saving, saved, error, set, save } = useConfigForm();

  const [llmTesting, setLlmTesting] = useState(false);
  const [llmResult, setLlmResult] = useState<TestResult | null>(null);
  const [embTesting, setEmbTesting] = useState(false);
  const [embResult, setEmbResult] = useState<TestResult | null>(null);
  const [rerankerTesting, setRerankerTesting] = useState(false);
  const [rerankerResult, setRerankerResult] = useState<TestResult | null>(null);
  const [utilityTesting, setUtilityTesting] = useState(false);
  const [utilityResult, setUtilityResult] = useState<TestResult | null>(null);

  async function handleSave() {
    await save({
      llm_provider: form.llm_provider,
      openai_api_key: form.openai_api_key,
      openai_base_url: form.openai_base_url,
      llm_model: form.llm_model,
      llm_utility_model: form.llm_utility_model,
      llm_utility_api_key: form.llm_utility_api_key,
      llm_utility_base_url: form.llm_utility_base_url,
      embedding_api_key: form.embedding_api_key,
      embedding_base_url: form.embedding_base_url,
      embedding_model: form.embedding_model,
      reranker_api_key: form.reranker_api_key,
      reranker_model: form.reranker_model,
      reranker_base_url: form.reranker_base_url,
      tavily_api_key: form.tavily_api_key,
      perplexity_api_key: form.perplexity_api_key,
    });
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-1">

      {/* ── 主模型 ─────────────────────────────────────────── */}
      <SectionHeader title={t("ai.sectionLlm")} />
      <div className="space-y-4 rounded-xl border border-border/40 bg-muted/20 p-4">
        <FieldSelectRow
          label={t("ai.providerLabel")}
          description={t("ai.providerDesc")}
          value={form.llm_provider ?? "openai"}
          options={[
            { value: "openai", label: "OpenAI / Compatible" },
            { value: "litellm", label: "LiteLLM (Gemini, Mistral…)" },
            { value: "anthropic", label: "Anthropic (Claude)" },
          ]}
          onChange={(v) => set("llm_provider", v)}
        />
        <FieldInput
          label={t("ai.apiKeyLabel")}
          description={t("ai.apiKeyDesc")}
          type="password"
          value={form.openai_api_key === "••••••••" ? "" : (form.openai_api_key ?? "")}
          onChange={(v) => set("openai_api_key", v)}
          placeholder={form.openai_api_key === "••••••••" ? tc("alreadySetHint") : "sk-..."}
        />
        <FieldInput
          label={t("ai.baseUrlLabel")}
          description={t("ai.baseUrlDesc")}
          value={form.openai_base_url ?? ""}
          onChange={(v) => set("openai_base_url", v)}
          placeholder={DEFAULT_BASE_URL}
        />
        <FieldModelRow
          label={t("ai.llmModel")}
          description={t("ai.llmModelDesc")}
          value={form.llm_model ?? DEFAULT_LLM_MODEL}
          options={LLM_MODELS}
          onChange={(v) => set("llm_model", v)}
        />
        <SectionTestButton
          testing={llmTesting}
          result={llmResult}
          onTest={async () => {
            setLlmTesting(true); setLlmResult(null);
            try {
              const r = await testLlmConnection();
              setLlmResult({ ok: r.ok, message: r.ok ? `${r.model} ✓` : r.message });
            } catch {
              setLlmResult({ ok: false, message: t("ai.testFailed") });
            } finally { setLlmTesting(false); }
          }}
        />
      </div>

      {/* ── 小模型 (辅助任务) ──────────────────────────────── */}
      <div className="pt-4">
        <SectionHeader title={t("ai.sectionUtility")} note={t("ai.utilityNote")} />
        <div className="space-y-4 rounded-xl border border-border/40 bg-muted/20 p-4">
          <FieldModelRow
            label={t("ai.utilityModel")}
            description={t("ai.utilityModelDesc")}
            value={form.llm_utility_model ?? ""}
            options={LLM_MODELS}
            onChange={(v) => set("llm_utility_model", v)}
          />
          <FieldInput
            label={t("ai.utilityApiKeyLabel")}
            description={t("ai.utilityApiKeyDesc")}
            type="password"
            value={form.llm_utility_api_key === "••••••••" ? "" : (form.llm_utility_api_key ?? "")}
            onChange={(v) => set("llm_utility_api_key", v)}
            placeholder={form.llm_utility_api_key === "••••••••" ? tc("alreadySetHint") : t("ai.utilityApiKeyPlaceholder")}
          />
          <FieldInput
            label={t("ai.utilityBaseUrlLabel")}
            description={t("ai.utilityBaseUrlDesc")}
            value={form.llm_utility_base_url ?? ""}
            onChange={(v) => set("llm_utility_base_url", v)}
            placeholder={t("ai.utilityBaseUrlPlaceholder")}
          />
          <SectionTestButton
            testing={utilityTesting}
            result={utilityResult}
            onTest={async () => {
              setUtilityTesting(true); setUtilityResult(null);
              try {
                const r = await testUtilityLlmConnection();
                setUtilityResult({ ok: r.ok, message: r.ok ? `${r.model} ✓` : r.message });
              } catch {
                setUtilityResult({ ok: false, message: t("ai.testFailed") });
              } finally { setUtilityTesting(false); }
            }}
          />
        </div>
      </div>

      {/* ── 向量化模型 ─────────────────────────────────────── */}
      <div className="pt-4">
        <SectionHeader title={t("ai.sectionEmbedding")} note={t("ai.embeddingNote")} />
        <div className="space-y-4 rounded-xl border border-border/40 bg-muted/20 p-4">
          <FieldInput
            label={t("ai.embeddingKeyLabel")}
            description={t("ai.embeddingKeyDesc")}
            type="password"
            value={form.embedding_api_key === "••••••••" ? "" : (form.embedding_api_key ?? "")}
            onChange={(v) => set("embedding_api_key", v)}
            placeholder={form.embedding_api_key === "••••••••" ? tc("alreadySetHint") : "sk-..."}
          />
          <FieldInput
            label={t("ai.embeddingBaseUrlLabel")}
            description={t("ai.embeddingBaseUrlDesc")}
            value={form.embedding_base_url ?? ""}
            onChange={(v) => set("embedding_base_url", v)}
            placeholder={DEFAULT_BASE_URL}
          />
          <FieldSelectRow
            label={t("ai.embeddingModel")}
            description={t("ai.embeddingModelDesc")}
            value={form.embedding_model ?? DEFAULT_EMBEDDING_MODEL}
            options={EMBEDDING_MODELS}
            onChange={(v) => set("embedding_model", v)}
          />
          <SectionTestButton
            testing={embTesting}
            result={embResult}
            onTest={async () => {
              setEmbTesting(true); setEmbResult(null);
              try {
                const r = await testEmbeddingConnection();
                setEmbResult({ ok: r.ok, message: r.ok ? `${r.model} · ${r.dimensions}d ✓` : r.message });
              } catch {
                setEmbResult({ ok: false, message: t("ai.testFailed") });
              } finally { setEmbTesting(false); }
            }}
          />
        </div>
      </div>

      {/* ── 重排序模型 ─────────────────────────────────────── */}
      <div className="pt-4">
        <SectionHeader title={t("ai.sectionReranker")} note={t("ai.sectionRerankerNote")} />
        <div className="space-y-4 rounded-xl border border-border/40 bg-muted/20 p-4">
          <FieldInput
            label={t("ai.rerankerKeyLabel")}
            description={t("ai.rerankerKeyDesc")}
            type="password"
            value={form.reranker_api_key === "••••••••" ? "" : (form.reranker_api_key ?? "")}
            onChange={(v) => set("reranker_api_key", v)}
            placeholder={form.reranker_api_key === "••••••••" ? tc("alreadySetHint") : "sk-..."}
          />
          <FieldInput
            label={t("ai.rerankerBaseUrlLabel")}
            description={t("ai.rerankerBaseUrlDesc")}
            value={form.reranker_base_url ?? ""}
            onChange={(v) => set("reranker_base_url", v)}
            placeholder={DEFAULT_RERANKER_BASE_URL}
          />
          <FieldSelectRow
            label={t("ai.rerankerModel")}
            description={t("ai.rerankerModelDesc")}
            value={form.reranker_model ?? DEFAULT_RERANKER_MODEL}
            options={RERANKER_MODELS}
            onChange={(v) => set("reranker_model", v)}
          />
          <SectionTestButton
            testing={rerankerTesting}
            result={rerankerResult}
            onTest={async () => {
              setRerankerTesting(true); setRerankerResult(null);
              try {
                const r = await testRerankerConnection();
                setRerankerResult({ ok: r.ok, message: r.ok ? `${r.model} ✓` : r.message });
              } catch {
                setRerankerResult({ ok: false, message: t("ai.testFailed") });
              } finally { setRerankerTesting(false); }
            }}
          />
        </div>
      </div>

      {/* ── 搜索增强 ───────────────────────────────────────── */}
      <div className="pt-4">
        <SectionHeader title={t("ai.sectionSearch")} />
        <div className="space-y-4 rounded-xl border border-border/40 bg-muted/20 p-4">
          <FieldInput
            label={t("ai.tavilyKeyLabel")}
            description={t("ai.tavilyKeyDesc")}
            type="password"
            value={form.tavily_api_key === "••••••••" ? "" : (form.tavily_api_key ?? "")}
            onChange={(v) => set("tavily_api_key", v)}
            placeholder={form.tavily_api_key === "••••••••" ? tc("alreadySetHint") : "tvly-..."}
          />
          <FieldInput
            label={t("ai.perplexityKeyLabel")}
            description={t("ai.perplexityKeyDesc")}
            type="password"
            value={form.perplexity_api_key === "••••••••" ? "" : (form.perplexity_api_key ?? "")}
            onChange={(v) => set("perplexity_api_key", v)}
            placeholder={form.perplexity_api_key === "••••••••" ? tc("alreadySetHint") : "pplx-..."}
          />
        </div>
      </div>

      {/* ── 保存 ────────────────────────────────────────────── */}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="pt-4">
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </div>
    </div>
  );
}


