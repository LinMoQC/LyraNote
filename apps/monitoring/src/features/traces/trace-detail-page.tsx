"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { ArrowLeft, ChevronDown, ChevronUp, Expand, X } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { ProtectedView } from "@/components/protected-view"
import { SectionCard } from "@/components/section-card"
import { StatusBadge } from "@/components/status-badge"
import { TRACES_ROUTE } from "@/lib/constants"
import { UnauthorizedError } from "@/lib/http-client"
import { cn, formatDateTime, formatDuration } from "@/lib/utils"
import type { TextSnapshot } from "@/services/monitoring-service"
import { getTraceDetail } from "@/services/monitoring-service"

// ---------------------------------------------------------------------------
// Types for parsed message arrays
// ---------------------------------------------------------------------------

interface ParsedMessage {
  role: string
  content: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_STYLES: Record<string, string> = {
  system: "bg-purple-500/10 border-purple-500/20 text-purple-300/80",
  user: "bg-blue-500/10 border-blue-500/20 text-blue-300/80",
  assistant: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300/80",
  tool: "bg-amber-500/10 border-amber-500/20 text-amber-300/80",
}

const ROLE_LABELS: Record<string, string> = {
  system: "SYSTEM",
  user: "USER",
  assistant: "ASSISTANT",
  tool: "TOOL",
}

/** Try to parse raw_preview as a messages array or a single content object. */
function tryParseMessages(raw: string): ParsedMessage[] | null {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && "content" in parsed[0]) {
      return parsed.map((m) => ({
        role: typeof m.role === "string" ? m.role : "unknown",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
      }))
    }
    if (typeof parsed === "object" && parsed !== null && "content" in parsed) {
      return [{
        role: "assistant",
        content: typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content ?? ""),
      }]
    }
  } catch {
    // not JSON — fall through
  }
  return null
}

// ---------------------------------------------------------------------------
// Prompt section splitting (static vs dynamic vs conversation)
// ---------------------------------------------------------------------------

const STATIC_DYNAMIC_BOUNDARY = "<!-- lyranote:dynamic -->"

type SectionKind = "system_static" | "system_dynamic" | "system_full" | "conversation"

interface ContentSection {
  kind: SectionKind
  label: string
  content?: string          // for system sections
  messages?: ParsedMessage[] // for conversation section
}

const SECTION_STYLES: Record<SectionKind, string> = {
  system_static: "border-purple-500/30 bg-purple-500/10 text-purple-300/90",
  system_dynamic: "border-amber-500/30 bg-amber-500/10 text-amber-300/90",
  system_full:    "border-purple-500/30 bg-purple-500/10 text-purple-300/90",
  conversation:   "border-border/40 bg-white/[0.04] text-muted/70",
}

function buildPromptSections(messages: ParsedMessage[]): ContentSection[] {
  const sections: ContentSection[] = []
  const conversationMessages: ParsedMessage[] = []

  for (const msg of messages) {
    if (msg.role === "system") {
      const idx = msg.content.indexOf(STATIC_DYNAMIC_BOUNDARY)
      if (idx !== -1) {
        const staticPart = msg.content.slice(0, idx).trim()
        const dynamicPart = msg.content.slice(idx + STATIC_DYNAMIC_BOUNDARY.length).trim()
        if (staticPart) {
          sections.push({ kind: "system_static", label: "System · 静态指令", content: staticPart })
        }
        if (dynamicPart) {
          sections.push({ kind: "system_dynamic", label: "System · 动态注入", content: dynamicPart })
        }
      } else {
        sections.push({ kind: "system_full", label: "System Prompt", content: msg.content })
      }
    } else {
      conversationMessages.push(msg)
    }
  }

  if (conversationMessages.length > 0) {
    sections.push({ kind: "conversation", label: "对话历史", messages: conversationMessages })
  }

  return sections
}

// ---------------------------------------------------------------------------
// PromptSectionBlock — collapsible section inside the modal
// ---------------------------------------------------------------------------

function PromptSectionBlock({ section }: { section: ContentSection }) {
  const [open, setOpen] = useState(section.kind !== "system_static")
  const headerStyle = SECTION_STYLES[section.kind]

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium tracking-wide transition-colors ${headerStyle}`}
      >
        <span>{section.label}</span>
        {open ? <ChevronUp size={13} className="shrink-0 opacity-60" /> : <ChevronDown size={13} className="shrink-0 opacity-60" />}
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 pl-1">
          {section.content !== undefined ? (
            <pre className="whitespace-pre-wrap rounded-lg border border-border/30 bg-black/20 p-4 text-xs leading-[1.7] text-muted/80">
              {section.content}
            </pre>
          ) : (
            section.messages?.map((msg, i) => (
              <MessageBubble key={i} msg={msg} index={i} defaultOpen={true} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MessagePreviewRow — compact single-line chip used inside SnapshotBlock cards
// ---------------------------------------------------------------------------

function MessagePreviewRow({ msg }: { msg: ParsedMessage }) {
  const styleClass = ROLE_STYLES[msg.role] ?? "bg-white/[0.04] border-border/30 text-muted/70"
  const label = ROLE_LABELS[msg.role] ?? msg.role.toUpperCase()
  const preview = msg.content.replace(/\n/g, " ").replace(/\s+/g, " ").trim()

  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 ${styleClass}`}>
      <span className="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em]">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] opacity-60">
        {preview}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MessageBubble — expandable bubble used inside the modal only
// ---------------------------------------------------------------------------

function MessageBubble({ msg, index, defaultOpen }: { msg: ParsedMessage; index: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen !== undefined ? defaultOpen : msg.role !== "system")
  const styleClass = ROLE_STYLES[msg.role] ?? "bg-white/[0.04] border-border/30 text-muted/70"
  const label = ROLE_LABELS[msg.role] ?? msg.role.toUpperCase()
  const content = msg.content

  return (
    <div className={`rounded-lg border p-3 ${styleClass}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center justify-between gap-2 text-left"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em]">
            {label}
          </span>
          {!open && (
            <span className="min-w-0 flex-1 truncate text-[11px] opacity-50">
              {content.replace(/\n/g, " ").slice(0, 120)}
            </span>
          )}
        </div>
        {open
          ? <ChevronUp size={13} className="shrink-0 opacity-40" />
          : <ChevronDown size={13} className="shrink-0 opacity-40" />}
      </button>
      {open && (
        <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-[1.65] opacity-80">
          {content}
        </pre>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SnapshotModal — full-content dialog rendered via portal, fixed height + scroll
// ---------------------------------------------------------------------------

function SnapshotModal({
  snapshot,
  title,
  onClose,
}: {
  snapshot: TextSnapshot
  title: string
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const messages = tryParseMessages(snapshot.raw_preview)
  const text = snapshot.raw_preview.replace(/\\n/g, "\n")

  return createPortal(
    // Backdrop — click to close
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal panel — flex column, capped at 85 vh */}
      <div
        className="flex w-full max-w-3xl flex-col rounded-2xl border border-border/50 bg-[#0d1117] shadow-2xl"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — fixed, never scrolls */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/40 px-6 py-4">
          <div>
            <p className="font-semibold text-foreground">{title}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted/50">
              <span>长度 {snapshot.char_count}</span>
              <span>SHA {snapshot.sha256.slice(0, 12)}</span>
              {snapshot.truncated
                ? <span className="text-amber-400/70">已截断（超出快照上限）</span>
                : <span>完整快照</span>
              }
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 shrink-0 rounded-lg p-1.5 text-muted/50 transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {messages ? (
            <div className="space-y-3">
              {buildPromptSections(messages).map((section, i) => (
                <PromptSectionBlock key={i} section={section} />
              ))}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg border border-border/40 bg-black/20 p-4 text-xs leading-[1.7] text-muted/80">
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// SnapshotBlock — compact preview + "查看全部" opens modal
// ---------------------------------------------------------------------------

const PREVIEW_LINES = 5
const PREVIEW_MESSAGES = 2

function SnapshotBlock({
  snapshot,
  emptyLabel,
  title = "快照",
}: {
  snapshot?: TextSnapshot | null
  emptyLabel: string
  title?: string
}) {
  const [modalOpen, setModalOpen] = useState(false)

  if (!snapshot?.raw_preview) {
    return <p className="text-sm text-muted/60">{emptyLabel}</p>
  }

  const messages = tryParseMessages(snapshot.raw_preview)

  const openButton = (
    <button
      onClick={() => setModalOpen(true)}
      className="flex items-center gap-1 text-accent/60 transition-colors hover:text-accent"
    >
      <Expand size={11} />
      查看全部
    </button>
  )

  return (
    <div className="space-y-2">
      {/* Preview */}
      {messages ? (
        // Structured: compact single-line preview rows
        <div className="space-y-1">
          {messages.slice(0, PREVIEW_MESSAGES).map((msg, i) => (
            <MessagePreviewRow key={i} msg={msg} />
          ))}
          {messages.length > PREVIEW_MESSAGES && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/40 py-2 text-xs text-muted/50 transition-colors hover:border-accent/40 hover:text-accent/70"
            >
              <ChevronDown size={13} />
              还有 {messages.length - PREVIEW_MESSAGES} 条消息
            </button>
          )}
        </div>
      ) : (
        // Plain text: show first N lines, fade bottom edge
        <div className="relative">
          <pre className="overflow-hidden rounded-lg border border-border/40 bg-black/20 p-3 text-xs leading-[1.65] text-muted/80 whitespace-pre-wrap"
            style={{ maxHeight: `${PREVIEW_LINES * 1.65 * 12 + 24}px` }}
          >
            {snapshot.raw_preview.replace(/\\n/g, "\n")}
          </pre>
          {/* Bottom fade */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-lg bg-gradient-to-t from-black/40 to-transparent" />
        </div>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted/50">
        <span>长度 {snapshot.char_count}</span>
        <span>SHA {snapshot.sha256.slice(0, 12)}</span>
        <span>{snapshot.truncated ? "已截断" : "完整快照"}</span>
        <span className="ml-auto">{openButton}</span>
      </div>

      {modalOpen && (
        <SnapshotModal snapshot={snapshot} title={title} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = "spans" | "llm" | "tools"

interface TabDef {
  id: TabId
  label: string
  count: number
}

function timelineDotClass(status: string) {
  if (status === "error" || status === "failed") return "bg-danger shadow-danger/20"
  if (status === "running") return "bg-accent shadow-accent/20"
  if (status === "stuck" || status === "stale") return "bg-warning shadow-warning/20"
  return "bg-success shadow-success/20"
}

// ---------------------------------------------------------------------------
// TraceDetailPage
// ---------------------------------------------------------------------------

export function TraceDetailPage({ traceId }: { traceId: string }) {
  const [activeTab, setActiveTab] = useState<TabId>("spans")

  const detailQuery = useQuery({
    queryKey: ["monitoring", "trace", traceId],
    queryFn: () => getTraceDetail(traceId),
  })
  const detail = detailQuery.data
  const primaryRun = detail?.runs[0]
  const runMetadata = (primaryRun?.metadata ?? {}) as Record<string, unknown>
  const inputSnapshot = runMetadata.query_snapshot as TextSnapshot | undefined
  const outputSnapshot =
    (runMetadata.final_answer_snapshot as TextSnapshot | undefined) ??
    (runMetadata.final_report_snapshot as TextSnapshot | undefined)
  const reasoningSnapshot = runMetadata.reasoning_snapshot as TextSnapshot | undefined

  const tabs: TabDef[] = [
    { id: "spans", label: "Span 时间线", count: detail?.spans.length ?? 0 },
    { id: "llm",   label: "LLM Calls",   count: detail?.llm_calls.length ?? 0 },
    { id: "tools", label: "Tools",        count: detail?.tool_calls.length ?? 0 },
  ]

  return (
    <ProtectedView unauthorized={detailQuery.error instanceof UnauthorizedError}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={TRACES_ROUTE}
          className="flex items-center gap-1.5 text-muted/60 transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          链路列表
        </Link>
        <span className="text-muted/30">/</span>
        <span className="font-mono text-xs text-muted/60 truncate max-w-[280px]">{traceId}</span>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40 p-5 backdrop-blur">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted/60">Trace ID</p>
          <p className="mt-2 break-all font-mono text-xs text-muted/80">{traceId}</p>
          <p className="mt-2 text-[11px] text-muted/50">用于串联日志、SSE 和后台任务。</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40 p-5 backdrop-blur">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted/60">Run 数量</p>
          <p className="mt-2 text-3xl font-bold tabular text-foreground">
            {detailQuery.data?.runs.length ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-muted/50">顶层运行单元。</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40 p-5 backdrop-blur">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted/60">LLM Calls</p>
          <p className="mt-2 text-3xl font-bold tabular text-foreground">
            {detail?.summary.total_llm_calls ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-muted/50">
            输入 {detail?.summary.total_input_tokens ?? 0} / 输出 {detail?.summary.total_output_tokens ?? 0}
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40 p-5 backdrop-blur">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted/60">链路状态</p>
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge status={detail?.summary.final_status ?? "unknown"} />
            <span className="text-sm text-muted/60">{formatDuration(detail?.summary.total_duration_ms ?? null)}</span>
          </div>
          <p className="mt-2 text-[11px] text-muted/50">
            工具调用 {detail?.summary.total_tool_calls ?? 0} 次
          </p>
        </div>
      </div>

      {/* Runs section */}
      <SectionCard title="顶层 Run" description="展示这条 trace 下的顶层运行单元。">
        <div className="space-y-2">
          {(detailQuery.data?.runs ?? []).map((run) => (
            <div
              key={run.id}
              className="flex items-center gap-4 rounded-lg border border-border/40 bg-card/30 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{run.name}</p>
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted/60">
                    {run.run_type}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted/60">
                  <span className="tabular">{formatDateTime(run.started_at)}</span>
                  <span className="tabular">{formatDuration(run.duration_ms)}</span>
                  {run.error_message ? (
                    <span className="text-danger/70 truncate max-w-[240px]">{run.error_message}</span>
                  ) : (
                    <span className="text-muted/40">无错误</span>
                  )}
                </div>
              </div>
              <StatusBadge status={run.status} />
            </div>
          ))}
          {!detailQuery.data?.runs.length ? (
            <p className="py-4 text-center text-sm text-muted/60">暂无 Run 记录。</p>
          ) : null}
        </div>
      </SectionCard>

      {/* Input / Output snapshots */}
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Input" description="用户问题或研究主题的截断快照。">
          <SnapshotBlock snapshot={inputSnapshot} emptyLabel="暂无输入快照。" title="Input" />
        </SectionCard>

        <SectionCard title="Output" description="最终回答 / 报告与推理摘要。">
          <div className="space-y-4">
            <SnapshotBlock snapshot={outputSnapshot} emptyLabel="暂无输出快照。" title="Output" />
            <div className="border-t border-border/30 pt-4">
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted/60">Reasoning</p>
              <SnapshotBlock snapshot={reasoningSnapshot} emptyLabel="暂无推理快照。" title="Reasoning" />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tabbed detail panel — Spans / LLM Calls / Tools                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur">
        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border/40 px-4 pt-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex items-center gap-1.5 rounded-t px-3 pb-2.5 pt-2 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-b-2 border-accent text-foreground"
                  : "text-muted/50 hover:text-muted/80",
              ].join(" ")}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={[
                  "rounded-full px-1.5 py-0.5 text-[10px] tabular",
                  activeTab === tab.id
                    ? "bg-accent/20 text-accent"
                    : "bg-white/[0.06] text-muted/50",
                ].join(" ")}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4">

          {/* ---- Spans tab ---- */}
          {activeTab === "spans" && (
            <div className="space-y-3">
              {(detail?.spans ?? []).map((span, index, spans) => (
                <div key={span.id} className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3 sm:grid-cols-[22px_minmax(0,1fr)] sm:gap-4">
                  {index < spans.length - 1 ? (
                    <div className="absolute left-[9px] top-5 bottom-[-12px] w-px bg-border/30 sm:left-[11px]" />
                  ) : null}

                  <div className="relative z-10 flex justify-center pt-2">
                    <div
                      className={cn(
                        "h-3.5 w-3.5 rounded-full border-2 border-background shadow-[0_0_0_4px_rgba(11,19,32,0.95)]",
                        timelineDotClass(span.status),
                      )}
                    />
                  </div>

                  <div className="min-w-0 rounded-xl border border-border/40 bg-card/30 px-4 py-3.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted/55">
                            Span {index + 1}
                          </span>
                          <p className="min-w-0 break-all text-sm font-medium text-foreground">
                            {span.span_name}
                          </p>
                        </div>
                        <p className="mt-1 text-[11px] text-muted/45">
                          {formatDateTime(span.started_at)}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <StatusBadge status={span.status} />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-muted/60">
                      <span className="rounded-md bg-white/[0.04] px-2 py-1 tabular text-muted/75">
                        耗时 {formatDuration(span.duration_ms)}
                      </span>
                      <span className="rounded-md bg-white/[0.04] px-2 py-1 text-muted/55">
                        {span.error_message ? "执行异常" : "执行完成"}
                      </span>
                    </div>

                    {span.error_message ? (
                      <p className="mt-3 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs leading-6 text-danger/80 break-words">
                        {span.error_message}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
              {!detail?.spans.length ? (
                <p className="py-8 text-center text-sm text-muted/60">暂无 Span 记录。</p>
              ) : null}
            </div>
          )}

          {/* ---- LLM Calls tab ---- */}
          {activeTab === "llm" && (
            <div className="space-y-3">
              {(detail?.llm_calls ?? []).map((call) => (
                <div key={call.id} className="rounded-xl border border-border/40 bg-card/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{call.call_type}</p>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted/60">
                        {call.model ?? "default"}
                      </span>
                    </div>
                    <StatusBadge status={call.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted/60">
                    <span>{formatDateTime(call.started_at)}</span>
                    <span>{formatDuration(call.duration_ms)}</span>
                    <span>输入 {call.input_tokens ?? 0}</span>
                    <span>输出 {call.output_tokens ?? 0}</span>
                    {call.reasoning_tokens ? <span>推理 {call.reasoning_tokens}</span> : null}
                    {call.ttft_ms ? <span>TTFT {call.ttft_ms}ms</span> : null}
                  </div>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted/60">Prompt</p>
                      <SnapshotBlock snapshot={call.prompt_snapshot} emptyLabel="暂无 prompt 快照。" title={`Prompt — ${call.call_type}`} />
                    </div>
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted/60">Response</p>
                      <SnapshotBlock snapshot={call.response_snapshot} emptyLabel="暂无结果快照。" title={`Response — ${call.call_type}`} />
                    </div>
                  </div>
                </div>
              ))}
              {!detail?.llm_calls.length ? (
                <p className="py-8 text-center text-sm text-muted/60">暂无 LLM 调用记录。</p>
              ) : null}
            </div>
          )}

          {/* ---- Tools tab ---- */}
          {activeTab === "tools" && (
            <div className="space-y-3">
              {(detail?.tool_calls ?? []).map((call) => (
                <div key={call.id} className="rounded-xl border border-border/40 bg-card/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{call.tool_name}</p>
                      {call.cache_hit ? (
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted/60">
                          cache hit
                        </span>
                      ) : null}
                    </div>
                    <StatusBadge status={call.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted/60">
                    <span>{formatDateTime(call.started_at)}</span>
                    <span>{formatDuration(call.duration_ms)}</span>
                    {call.result_count !== null ? <span>结果 {call.result_count}</span> : null}
                    {call.followup_tool_hint ? <span>建议下一步 {call.followup_tool_hint}</span> : null}
                  </div>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted/60">Input</p>
                      <SnapshotBlock snapshot={call.input_snapshot} emptyLabel="暂无工具输入。" title={`Input — ${call.tool_name}`} />
                    </div>
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted/60">Output</p>
                      <SnapshotBlock snapshot={call.output_snapshot} emptyLabel="暂无工具输出。" title={`Output — ${call.tool_name}`} />
                    </div>
                  </div>
                </div>
              ))}
              {!detail?.tool_calls.length ? (
                <p className="py-8 text-center text-sm text-muted/60">暂无工具或检索记录。</p>
              ) : null}
            </div>
          )}

        </div>
      </div>
    </ProtectedView>
  )
}
