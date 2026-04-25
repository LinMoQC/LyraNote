"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, m } from "framer-motion"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  HardDrive,
  KeyRound,
  Loader2,
  Sparkles,
  User,
  Zap,
} from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem } from "@/components/ui/select"
import { useAuth } from "@/features/auth/auth-provider"
import {
  DEFAULT_BASE_URL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_LLM_MODEL,
  DEFAULT_RERANKER_BASE_URL,
  DEFAULT_RERANKER_MODEL,
  EMBEDDING_MODELS,
  LLM_MODELS,
  RERANKER_MODELS,
  STORAGE_LOGO,
} from "@/lib/constants"
import {
  createAccountSchema,
  createAiSchema,
  createPersonalitySchema,
  createStorageSchema,
  type AccountValues,
  type AIValues,
  type PersonalityValues,
  type StorageValues,
} from "@/schemas/setup-schemas"
import { setupInit, testEmbeddingConnection, testLlmConnection, testRerankerConnection } from "@/services/auth-service"

// ── Storage provider brand icons ──────────────────────────────────────────────

// STORAGE_LOGO imported from @/lib/constants

function StorageIcon({ value }: { value: string }) {
  if (value === "local")
    return <HardDrive size={26} className="text-muted-foreground" />

  const logo = STORAGE_LOGO[value]
  if (!logo) return null

  return (
    <Image
      src={logo.src}
      alt={value}
      width={logo.w}
      height={logo.h}
      style={{ maxWidth: logo.w, maxHeight: 32, objectFit: "contain" }}
    />
  )
}

// ── Step data ─────────────────────────────────────────────────────────────────

const STEPS = [
  { icon: User,         labelKey: "steps.account",      descKey: "steps.accountDesc" },
  { icon: KeyRound,     labelKey: "steps.aiConfig",     descKey: "steps.aiConfigDesc" },
  { icon: Database,     labelKey: "steps.storage",      descKey: "steps.storageDesc" },
  { icon: Sparkles,     labelKey: "steps.personality",  descKey: "steps.personalityDesc" },
  { icon: CheckCircle2, labelKey: "steps.done",         descKey: "" },
]

// ── Left sidebar step list (desktop) ─────────────────────────────────────────

function SideSteps({ current }: { current: number }) {
  const t = useTranslations("setup")
  return (
    <nav className="flex flex-col gap-0.5">
      {STEPS.map((step, i) => {
        const Icon = step.icon
        const done = i < current
        const active = i === current
        return (
          <div
            key={i}
            className={[
              "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
              active ? "bg-primary/8" : "",
            ].join(" ")}
          >
            <div
              className={[
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs transition-colors",
                done    ? "bg-primary/20 text-primary"
                : active ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                         : "bg-muted text-muted-foreground/40",
              ].join(" ")}
            >
              {done ? <CheckCircle2 size={13} /> : <Icon size={13} />}
            </div>
            <div className="min-w-0">
              <p className={[
                "text-sm font-medium leading-none",
                done ? "text-muted-foreground" : active ? "text-foreground" : "text-muted-foreground/40",
              ].join(" ")}>{t(step.labelKey)}</p>
              {step.descKey && (
                <p className={["mt-0.5 text-[11px]", active ? "text-muted-foreground" : "text-muted-foreground/30"].join(" ")}>
                  {t(step.descKey)}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

// ── Mobile progress bar ───────────────────────────────────────────────────────

function MobileProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((_, i) => (
        <div
          key={i}
          className={[
            "h-1 flex-1 rounded-full transition-all duration-300",
            i < current  ? "bg-primary"
            : i === current ? "bg-primary/60"
                             : "bg-border",
          ].join(" ")}
        />
      ))}
    </div>
  )
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({
  label, hint, error, children,
}: {
  label: string; hint?: string; error?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {error  && <p className="text-[11px] text-destructive">{error}</p>}
      {hint && !error && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter()
  const t = useTranslations("setup")
  const tc = useTranslations("common")
  const { refetch } = useAuth()
  const [step, setStep] = useState(0)
  const [accountData, setAccountData] = useState<AccountValues | null>(null)
  const [aiData, setAiData] = useState<AIValues | null>(null)
  const [storageData, setStorageData] = useState<StorageValues | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [llmCustomMode, setLlmCustomMode] = useState(false)
  const [embTesting, setEmbTesting] = useState(false)
  const [embTestResult, setEmbTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [rerankerTesting, setRerankerTesting] = useState(false)
  const [rerankerTestResult, setRerankerTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const accountSchema = createAccountSchema(t)
  const aiSchema = createAiSchema(t)
  const storageSchema = createStorageSchema(t)
  const personalitySchema = createPersonalitySchema(t)

  const storageProviders = [
    { value: "local" as const, label: t("storage.local"), desc: t("storage.noConfig") },
    { value: "minio" as const, label: "MinIO",            desc: t("storage.selfHosted") },
    { value: "s3" as const,    label: "AWS S3",            desc: t("storage.aws") },
    { value: "oss" as const,   label: t("storage.aliOss"),   desc: t("storage.cnFast") },
    { value: "cos" as const,   label: t("storage.tencentCos"), desc: t("storage.cnFast") },
  ]

  const accountForm = useForm<AccountValues>({ resolver: zodResolver(accountSchema) })
  const avatarUrl = accountForm.watch("avatar_url")

  const aiForm = useForm<AIValues>({
    resolver: zodResolver(aiSchema),
    defaultValues: {
      llm_provider: "openai",
      openai_base_url: DEFAULT_BASE_URL,
      llm_model: DEFAULT_LLM_MODEL,
      embedding_model: DEFAULT_EMBEDDING_MODEL,
      embedding_api_key: "",
      embedding_base_url: "",
      reranker_api_key: "",
      reranker_base_url: DEFAULT_RERANKER_BASE_URL,
      reranker_model: DEFAULT_RERANKER_MODEL,
      tavily_api_key: "",
    },
  })

  const storageForm = useForm<StorageValues>({
    resolver: zodResolver(storageSchema),
    defaultValues: { storage_backend: "local", storage_s3_bucket: "lyranote" },
  })
  const storageBackend = storageForm.watch("storage_backend")

  const personalityForm = useForm<PersonalityValues>({
    resolver: zodResolver(personalitySchema),
    defaultValues: { ai_name: "Lyra", user_occupation: "", user_preferences: "" },
  })

  async function handleTestLlm() {
    const apiKey = aiForm.getValues("openai_api_key")
    if (!apiKey) {
      setTestResult({ ok: false, message: t("fillApiKeyFirst") })
      return
    }
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testLlmConnection({
        api_key: apiKey,
        base_url: aiForm.getValues("openai_base_url") || undefined,
        model: aiForm.getValues("llm_model") || undefined,
        llm_provider: aiForm.getValues("llm_provider") || undefined,
      })
      setTestResult(result)
    } catch {
      setTestResult({ ok: false, message: t("requestFailed") })
    } finally {
      setIsTesting(false)
    }
  }

  async function handleTestEmbedding() {
    const apiKey = aiForm.getValues("embedding_api_key") || aiForm.getValues("openai_api_key")
    if (!apiKey) {
      setEmbTestResult({ ok: false, message: t("fillApiKeyFirst") })
      return
    }
    setEmbTesting(true)
    setEmbTestResult(null)
    try {
      const result = await testEmbeddingConnection({
        api_key: apiKey,
        base_url: aiForm.getValues("embedding_base_url") || aiForm.getValues("openai_base_url") || undefined,
        model: aiForm.getValues("embedding_model") || undefined,
      })
      setEmbTestResult({ ok: result.ok, message: result.ok ? t("embDimensions", { dimensions: result.dimensions }) : result.message })
    } catch {
      setEmbTestResult({ ok: false, message: t("requestFailed") })
    } finally {
      setEmbTesting(false)
    }
  }

  async function handleTestReranker() {
    const apiKey = aiForm.getValues("reranker_api_key") || aiForm.getValues("openai_api_key")
    if (!apiKey) {
      setRerankerTestResult({ ok: false, message: t("fillApiKeyFirst") })
      return
    }
    setRerankerTesting(true)
    setRerankerTestResult(null)
    try {
      const result = await testRerankerConnection({
        api_key: apiKey,
        base_url: aiForm.getValues("reranker_base_url") || aiForm.getValues("openai_base_url") || undefined,
        model: aiForm.getValues("reranker_model") || undefined,
      })
      setRerankerTestResult(result)
    } catch {
      setRerankerTestResult({ ok: false, message: t("requestFailed") })
    } finally {
      setRerankerTesting(false)
    }
  }

  function handleAccountNext(values: AccountValues) {
    setAccountData(values)
    setStep(1)
  }

  function handleAINext(values: AIValues) {
    setAiData(values)
    setStep(2)
  }

  function handleStorageNext(values: StorageValues) {
    setStorageData(values)
    setStep(3)
  }

  async function handlePersonalitySubmit(personality: PersonalityValues) {
    if (!accountData || !aiData || !storageData) return
    setIsSubmitting(true)
    setGlobalError(null)
    try {
      await setupInit({
        username: accountData.username,
        password: accountData.password,
        email: accountData.email,
        avatar_url: accountData.avatar_url,
        llm_provider: aiData.llm_provider,
        openai_api_key: aiData.openai_api_key,
        openai_base_url: aiData.openai_base_url || DEFAULT_BASE_URL,
        llm_model: aiData.llm_model,
        embedding_model: aiData.embedding_model,
        embedding_api_key: aiData.embedding_api_key,
        embedding_base_url: aiData.embedding_base_url,
        reranker_api_key: aiData.reranker_api_key,
        reranker_base_url: aiData.reranker_base_url,
        reranker_model: aiData.reranker_model,
        tavily_api_key: aiData.tavily_api_key,
        storage_backend: storageData.storage_backend,
        storage_region: storageData.storage_region,
        storage_s3_endpoint_url: storageData.storage_s3_endpoint_url,
        storage_s3_bucket: storageData.storage_s3_bucket,
        storage_s3_access_key: storageData.storage_s3_access_key,
        storage_s3_secret_key: storageData.storage_s3_secret_key,
        ai_name: personality.ai_name,
        user_occupation: personality.user_occupation,
        user_preferences: personality.user_preferences,
      })
      await refetch()
      setStep(4)
      setTimeout(() => router.push("/app"), 1800)
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        t("initFailed")
      setGlobalError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Left branding panel (desktop only) ── */}
      <aside className="hidden lg:flex lg:w-72 xl:w-80 flex-col border-r border-border bg-sidebar p-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
            {/* Soft glow behind logo */}
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 blur-sm" />
            <Image
              src="/lyra.png"
              alt="Lyra"
              width={32}
              height={32}
              className="relative h-8 w-8 rounded object-contain"
            />
          </div>
          <span className="text-lg font-semibold text-foreground">LyraNote</span>
        </div>

        <div className="mt-8">
          <p className="text-2xl font-bold leading-snug text-foreground">{t("init")}<br />{t("wizard")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("wizardDesc")}</p>
        </div>

        <div className="mt-8 flex-1">
          <SideSteps current={step} />
        </div>

        <p className="text-[11px] text-muted-foreground/40">{t("brand")}</p>
      </aside>

      {/* ── Right form panel ── */}
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-8">

        {/* Mobile: logo + progress */}
        <div className="mb-6 flex w-full max-w-sm flex-col gap-3 lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
              <Image src="/lyra.png" width={22} height={22} alt="LyraNote" className="object-contain" />
            </div>
            <span className="font-semibold text-foreground">LyraNote</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {step + 1} / {STEPS.length}
            </span>
          </div>
          <MobileProgress current={step} />
        </div>

        {/* Form card */}
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl shadow-black/5">
          <AnimatePresence mode="wait">

            {/* ── Step 0: 账户 ── */}
            {step === 0 && (
              <m.div
                key="account"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
              >
                <div className="border-b border-border px-6 py-4">
                  <p className="font-semibold text-foreground">{t("createAdmin")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("createAdminDesc")}</p>
                </div>
                <form onSubmit={accountForm.handleSubmit(handleAccountNext)} className="space-y-4 p-6">
                  <Field label={t("username")} error={accountForm.formState.errors.username?.message}>
                    <Input autoComplete="username" {...accountForm.register("username")} />
                  </Field>

                  <Field label={t("password")} error={accountForm.formState.errors.password?.message}>
                    <Input type="password" autoComplete="new-password" {...accountForm.register("password")} />
                  </Field>

                  <Field label={t("confirmPassword")} error={accountForm.formState.errors.confirmPassword?.message}>
                    <Input type="password" autoComplete="new-password" {...accountForm.register("confirmPassword")} />
                  </Field>

                  <Field label={t("emailOptional")} error={accountForm.formState.errors.email?.message} hint={t("emailHint")}>
                    <Input type="email" placeholder="you@example.com" autoComplete="email" {...accountForm.register("email")} />
                  </Field>

                  <Field
                    label={t("avatarUrlOptional")}
                    error={accountForm.formState.errors.avatar_url?.message}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="https://..."
                        className="flex-1"
                        {...accountForm.register("avatar_url")}
                      />
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                        {avatarUrl && !accountForm.formState.errors.avatar_url ? (
                          <Image
                            src={avatarUrl}
                            alt="avatar"
                            width={36}
                            height={36}
                            className="h-full w-full object-cover"
                            unoptimized
                            onError={() => accountForm.setError("avatar_url", { message: t("imageLoadFailed") })}
                          />
                        ) : (
                          <User size={14} className="text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </Field>

                  <button
                    type="submit"
                    className="group relative mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:brightness-110 active:scale-[0.98]"
                  >
                    {tc("next")}
                    <ChevronRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>
                </form>
              </m.div>
            )}

            {/* ── Step 1: AI ── */}
            {step === 1 && (
              <m.div
                key="ai"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
              >
                <div className="border-b border-border px-6 py-4">
                  <p className="font-semibold text-foreground">{t("configureAi")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("configureAiDesc")}</p>
                </div>
                <form onSubmit={aiForm.handleSubmit(handleAINext)} className="space-y-4 p-6">
                  {/* ── 主模型 ── */}
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t("mainModel")}</p>
                  <Field label={t("llmProvider")} hint={t("llmProviderHint")}>
                    <Select defaultValue="openai" onValueChange={(v) => aiForm.setValue("llm_provider", v as AIValues["llm_provider"])}>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI / Compatible</SelectItem>
                        <SelectItem value="litellm">LiteLLM (Gemini, Mistral…)</SelectItem>
                        <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="LLM API Key" hint={t("llmApiKeyHint")} error={aiForm.formState.errors.openai_api_key?.message}>
                    <Input placeholder="sk-..." autoComplete="off" {...aiForm.register("openai_api_key")} />
                  </Field>

                  <Field
                    label={t("llmBaseUrl")}
                    hint={t("llmBaseUrlHint")}
                    error={aiForm.formState.errors.openai_base_url?.message}
                  >
                    <Input placeholder={DEFAULT_BASE_URL} {...aiForm.register("openai_base_url")} />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("chatModel")} error={aiForm.formState.errors.llm_model?.message}>
                      {llmCustomMode ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            autoFocus
                            placeholder={t("customModelPlaceholder")}
                            {...aiForm.register("llm_model")}
                          />
                          <button
                            type="button"
                            onClick={() => { setLlmCustomMode(false); aiForm.setValue("llm_model", DEFAULT_LLM_MODEL); }}
                            className="flex-shrink-0 rounded-lg border border-border/60 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {tc("cancel")}
                          </button>
                        </div>
                      ) : (
                        <Select defaultValue={DEFAULT_LLM_MODEL} onValueChange={(v) => {
                          if (v === "__custom__") { setLlmCustomMode(true); aiForm.setValue("llm_model", ""); }
                          else aiForm.setValue("llm_model", v);
                        }}>
                          <SelectContent>
                            {LLM_MODELS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                <span className="flex items-center gap-1.5">
                                  {m.label}
                                  {m.thinking && (
                                    <span className="rounded-md bg-violet-500/15 px-1 py-0.5 text-[9px] font-medium text-violet-400">
                                      Thinking
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                            <SelectItem value="__custom__">
                              <span className="text-muted-foreground">{t("customModel")}</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </Field>

                    <Field label={t("embeddingModel")} error={aiForm.formState.errors.embedding_model?.message}>
                      <Select defaultValue={DEFAULT_EMBEDDING_MODEL} onValueChange={(v) => aiForm.setValue("embedding_model", v)}>
                        <SelectContent>
                          {EMBEDDING_MODELS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  {/* ── 高级配置（可折叠）── */}
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    <ChevronRight size={12} className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`} />
                    {t("advancedConfig")}
                  </button>

                  {showAdvanced && (
                    <div className="space-y-4 rounded-xl border border-border/40 bg-muted/20 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t("embSectionTitle")}</p>
                      <Field label={t("embApiKeyOptional")}>
                        <Input placeholder="sk-..." autoComplete="off" {...aiForm.register("embedding_api_key")} />
                      </Field>
                      <Field label={t("embBaseUrlOptional")}>
                        <Input placeholder={DEFAULT_BASE_URL} {...aiForm.register("embedding_base_url")} />
                      </Field>
                      <div className="flex items-center gap-3 border-t border-border/30 pt-3">
                        <button
                          type="button"
                          onClick={handleTestEmbedding}
                          disabled={embTesting}
                          className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-50"
                        >
                          {embTesting ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                          {t("testEmbedding")}
                        </button>
                        {embTestResult && (
                          <span className={embTestResult.ok ? "text-xs text-emerald-400" : "text-xs text-red-400"}>
                            {embTestResult.message}
                          </span>
                        )}
                      </div>

                      <p className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t("rerankerSectionTitle")}</p>
                      <Field label={t("rerankerApiKeyOptional")} hint={t("siliconflowHint")}>
                        <Input placeholder="sk-..." autoComplete="off" {...aiForm.register("reranker_api_key")} />
                      </Field>
                      <Field label={t("rerankerBaseUrlOptional")}>
                        <Input placeholder={DEFAULT_RERANKER_BASE_URL} {...aiForm.register("reranker_base_url")} />
                      </Field>
                      <Field label={t("rerankerModel")}>
                        <Select defaultValue={DEFAULT_RERANKER_MODEL} onValueChange={(v) => aiForm.setValue("reranker_model", v)}>
                          <SelectContent>
                            {RERANKER_MODELS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <div className="flex items-center gap-3 border-t border-border/30 pt-3">
                        <button
                          type="button"
                          onClick={handleTestReranker}
                          disabled={rerankerTesting}
                          className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-50"
                        >
                          {rerankerTesting ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                          {t("testReranker")}
                        </button>
                        {rerankerTestResult && (
                          <span className={rerankerTestResult.ok ? "text-xs text-emerald-400" : "text-xs text-red-400"}>
                            {rerankerTestResult.message}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <Field label={t("tavilyApiKeyOptional")} hint={t("tavilyHint")}>
                    <Input placeholder="tvly-..." autoComplete="off" {...aiForm.register("tavily_api_key")} />
                  </Field>

                  {/* Test connection */}
                  <button
                    type="button"
                    onClick={handleTestLlm}
                    disabled={isTesting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                  >
                    {isTesting
                      ? <><Loader2 size={14} className="animate-spin" /> {t("testing")}</>
                      : <><Zap size={14} /> {t("testLlm")}</>
                    }
                  </button>
                  {testResult && (
                    <div className={[
                      "rounded-lg px-3 py-2 text-xs",
                      testResult.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive",
                    ].join(" ")}>
                      {testResult.ok ? t("connectionOk") : testResult.message}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="submit"
                      className="group flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:brightness-110 active:scale-[0.98]"
                    >
                      {tc("next")}
                      <ChevronRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </form>
              </m.div>
            )}

            {/* ── Step 2: 存储 ── */}
            {step === 2 && (
              <m.div
                key="storage"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
              >
                <div className="border-b border-border px-6 py-4">
                  <p className="font-semibold text-foreground">{t("configureStorage")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("configureStorageDesc")}</p>
                </div>
                <form onSubmit={storageForm.handleSubmit(handleStorageNext)} className="space-y-4 p-6">

                  {/* Provider grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {storageProviders.map((p) => {
                      const active = storageBackend === p.value
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => storageForm.setValue("storage_backend", p.value)}
                          className={[
                            "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs transition-colors",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          ].join(" ")}
                        >
                          <div className="flex h-8 items-center justify-center">
                            <StorageIcon value={p.value} />
                          </div>
                          <span className="font-medium leading-tight">{p.label}</span>
                          <span className={["text-[10px] leading-tight", active ? "text-primary/70" : "text-muted-foreground/50"].join(" ")}>
                            {p.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Dynamic config fields */}
                  <AnimatePresence mode="wait">
                    {storageBackend !== "local" && (
                      <m.div
                        key={storageBackend}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-3 rounded-xl border border-border bg-muted/20 p-3"
                      >
                        {/* Endpoint URL — MinIO & OSS */}
                        {(storageBackend === "minio" || storageBackend === "oss") && (
                          <Field
                            label={storageBackend === "minio" ? t("minioEndpoint") : "OSS Endpoint"}
                            hint={storageBackend === "minio" ? "e.g. http://localhost:9000" : "e.g. https://oss-cn-hangzhou.aliyuncs.com"}
                            error={storageForm.formState.errors.storage_s3_endpoint_url?.message}
                          >
                            <Input
                              placeholder={storageBackend === "minio" ? "http://localhost:9000" : "https://oss-cn-hangzhou.aliyuncs.com"}
                              {...storageForm.register("storage_s3_endpoint_url")}
                            />
                          </Field>
                        )}

                        {/* Region — AWS S3 & Tencent COS */}
                        {(storageBackend === "s3" || storageBackend === "cos") && (
                          <Field
                            label={t("region")}
                            hint={storageBackend === "s3" ? "e.g. us-east-1 / ap-northeast-1" : "e.g. ap-guangzhou / ap-shanghai"}
                            error={storageForm.formState.errors.storage_region?.message}
                          >
                            <Input
                              placeholder={storageBackend === "s3" ? "us-east-1" : "ap-guangzhou"}
                              {...storageForm.register("storage_region")}
                            />
                          </Field>
                        )}

                        {/* Bucket */}
                        <Field
                          label={storageBackend === "cos" ? t("bucketWithAppId") : t("bucketName")}
                          hint={storageBackend === "cos" ? "e.g. mybucket-1250000000" : undefined}
                          error={storageForm.formState.errors.storage_s3_bucket?.message}
                        >
                          <Input
                            placeholder={storageBackend === "cos" ? "mybucket-1250000000" : "lyranote"}
                            {...storageForm.register("storage_s3_bucket")}
                          />
                        </Field>

                        {/* Access Key / Secret Key */}
                        <div className="grid grid-cols-2 gap-2">
                          <Field
                            label={storageBackend === "cos" ? "SecretId" : "Access Key"}
                            error={storageForm.formState.errors.storage_s3_access_key?.message}
                          >
                            <Input
                              placeholder={storageBackend === "cos" ? "AKIDxxxxxxxx" : "ACCESS_KEY"}
                              {...storageForm.register("storage_s3_access_key")}
                            />
                          </Field>
                          <Field
                            label={storageBackend === "cos" ? "SecretKey" : "Secret Key"}
                            error={storageForm.formState.errors.storage_s3_secret_key?.message}
                          >
                            <Input type="password" placeholder="••••••••" {...storageForm.register("storage_s3_secret_key")} />
                          </Field>
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="submit"
                      className="group flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:brightness-110 active:scale-[0.98]"
                    >
                      {tc("next")} <ChevronRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </form>
              </m.div>
            )}

            {/* ── Step 3: 个性化 ── */}
            {step === 3 && (
              <m.div
                key="personality"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
              >
                <div className="border-b border-border px-6 py-4">
                  <p className="font-semibold text-foreground">{t("personalizeTitle")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("personalizeDesc")}</p>
                </div>
                <form onSubmit={personalityForm.handleSubmit(handlePersonalitySubmit)} className="space-y-4 p-6">

                  <Field label={t("aiName")} error={personalityForm.formState.errors.ai_name?.message} hint={t("aiNameHint")}>
                    <Input placeholder="Lyra" {...personalityForm.register("ai_name")} />
                  </Field>

                  <Field label={t("occupation")} hint={t("occupationHint")}>
                    <Input placeholder={t("occupationPlaceholder")} {...personalityForm.register("user_occupation")} />
                  </Field>

                  <Field label={t("preferences")} hint={t("preferencesHint")}>
                    <textarea
                      placeholder={t("preferencesPlaceholder")}
                      rows={2}
                      className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30"
                      {...personalityForm.register("user_preferences")}
                    />
                  </Field>

                  {globalError && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{globalError}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="group flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
                    >
                      {isSubmitting
                        ? <><Loader2 size={14} className="animate-spin" /> {t("initializing")}</>
                        : <>{t("finishSetup")} <CheckCircle2 size={14} className="opacity-70" /></>
                      }
                    </button>
                  </div>
                </form>
              </m.div>
            )}

            {/* ── Step 4: 完成 ── */}
            {step === 4 && (
              <m.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center gap-4 px-8 py-12 text-center"
              >
                <m.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.1 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
                >
                  <CheckCircle2 size={30} className="text-primary" />
                </m.div>
                <div>
                  <p className="text-lg font-semibold text-foreground">{tc("setupDone")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("redirecting")}</p>
                </div>
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </m.div>
            )}

          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
